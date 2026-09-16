import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAllSongCreditRowsForArtistAggregation,
  fetchAllSongRowsForArtistAggregation,
} from '@/lib/library-artist-count-rows';
import {
  compareDisplayTitleCaseInsensitive,
  indexLetterForArtist,
  stripLeadingArticleForSort,
} from '@/lib/admin-library-index';
import { primaryArtistForLibraryIndex, mergeLibraryArtistIndexItems } from '@/lib/library-search-query';
import {
  filterSongRowsByLibraryCatalog,
  type LibraryCatalogFilter,
  LIBRARY_CATALOG_FILTERS,
} from '@/lib/song-catalog-scope';
import { pickDominantNavStyleSlug, songNavStyleSlugFromColumn } from '@/lib/music-library-artist-charts';
import {
  MUSIC8_NAV_STYLE_SLUGS,
  type Music8NavStyleSlug,
} from '@/lib/music8-catalog-slugs';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import { createAdminClient } from '@/lib/supabase/admin';

export type LibraryArtistIndexItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

export type LibraryArtistIndexPayload = {
  items: LibraryArtistIndexItem[];
  letters: string[];
  /** `songs.music8_artist_slug` ごとのユニーク曲数（feat. クレジットは含めない） */
  countsBySlug: Record<string, number>;
  /** 曲数が最多のナビスタイル（詳細の Style Breakdown 先頭と同じ趣旨） */
  styleBySlug: Record<string, Music8NavStyleSlug>;
};

type ArtistIndexBucket = {
  display: string;
  songIds: Set<string>;
};

/** プロセス内メモリキャッシュ（同一インスタンスの連続アクセス用） */
const INDEX_MEMORY_TTL_MS = 15 * 60 * 1000;
/** データ修正後に dev プロセスの古いメモリ索引を捨てる */
const INDEX_CACHE_GEN = 4;
/** DB スナップショットの鮮度。切れても stale-while-revalidate で先に返し、裏で再構築する */
const INDEX_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const SNAPSHOT_TABLE = 'library_artist_index_snapshots';

const indexCache = new Map<
  LibraryCatalogFilter,
  { builtAt: number; gen: number; payload: LibraryArtistIndexPayload }
>();

const inFlight = new Map<LibraryCatalogFilter, Promise<LibraryArtistIndexPayload>>();
const backgroundRefresh = new Set<LibraryCatalogFilter>();

let snapshotTableMissing = false;

const cacheClearListeners: Array<() => void> = [];

/** 公開ライブラリ側の slug 解決キャッシュなど、索引クリアに連動させる */
export function onLibraryArtistIndexCacheCleared(listener: () => void): void {
  cacheClearListeners.push(listener);
}

export function clearLibraryArtistIndexCache(): void {
  indexCache.clear();
  // 進行中の再構築結果が古い判定で上書きされないよう、完了後にメモリへ載せる前に clear 済みなら捨てる
  for (const catalog of LIBRARY_CATALOG_FILTERS) {
    backgroundRefresh.delete(catalog);
  }
  for (const fn of cacheClearListeners) fn();
  void deleteLibraryArtistIndexSnapshots();
}

function artistIndexKey(name: string): string {
  return stripLeadingArticleForSort(name).trim().toLowerCase();
}

function mergeArtistDisplayName(existing: string, candidate: string): string {
  const e = existing.trim();
  const c = candidate.trim();
  if (!e) return c;
  if (e.includes(',') && !c.includes(',')) return c;
  if (
    /^the\s+/i.test(c) &&
    !/^the\s+/i.test(e) &&
    artistIndexKey(e) === artistIndexKey(c)
  ) {
    return c;
  }
  return e;
}

const SNAPSHOT_COUNTS_BY_SLUG_KEY = '__countsBySlug';
const SNAPSHOT_STYLE_BY_SLUG_KEY = '__styleBySlug';

function parseCountsBySlugMap(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const countsBySlug: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = key.trim().toLowerCase();
    if (!slug || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    countsBySlug[slug] = value;
  }
  return Object.keys(countsBySlug).length > 0 ? countsBySlug : null;
}

function parseStyleBySlugMap(raw: unknown): Record<string, Music8NavStyleSlug> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const allowed = new Set<string>(MUSIC8_NAV_STYLE_SLUGS);
  const styleBySlug: Record<string, Music8NavStyleSlug> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = key.trim().toLowerCase();
    if (!slug || typeof value !== 'string') continue;
    const style = value.trim().toLowerCase();
    if (!allowed.has(style)) continue;
    styleBySlug[slug] = style as Music8NavStyleSlug;
  }
  return Object.keys(styleBySlug).length > 0 ? styleBySlug : null;
}

function embedSlugMetaInSnapshotItems(
  items: LibraryArtistIndexItem[],
  countsBySlug: Record<string, number>,
  styleBySlug: Record<string, Music8NavStyleSlug>,
): unknown[] {
  return [
    ...items,
    { [SNAPSHOT_COUNTS_BY_SLUG_KEY]: countsBySlug, [SNAPSHOT_STYLE_BY_SLUG_KEY]: styleBySlug },
  ];
}

function extractSlugMetaFromSnapshotItems(rawItems: unknown[]): {
  countsBySlug: Record<string, number> | null;
  styleBySlug: Record<string, Music8NavStyleSlug> | null;
} {
  let countsBySlug: Record<string, number> | null = null;
  let styleBySlug: Record<string, Music8NavStyleSlug> | null = null;
  for (const row of rawItems) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (!countsBySlug) countsBySlug = parseCountsBySlugMap(r[SNAPSHOT_COUNTS_BY_SLUG_KEY]);
    if (!styleBySlug) styleBySlug = parseStyleBySlugMap(r[SNAPSHOT_STYLE_BY_SLUG_KEY]);
  }
  return { countsBySlug, styleBySlug };
}

/** jsonb スナップショットを安全にパース（破損行は null） */
export function parseLibraryArtistIndexSnapshotPayload(raw: {
  items?: unknown;
  letters?: unknown;
  countsBySlug?: unknown;
  styleBySlug?: unknown;
}): LibraryArtistIndexPayload | null {
  if (!Array.isArray(raw.items) || !Array.isArray(raw.letters)) return null;
  const items: LibraryArtistIndexItem[] = [];
  for (const row of raw.items) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const main_artist = typeof r.main_artist === 'string' ? r.main_artist.trim() : '';
    const count = typeof r.count === 'number' && Number.isFinite(r.count) ? r.count : null;
    const indexLetter = typeof r.indexLetter === 'string' ? r.indexLetter : '';
    if (!main_artist || count == null || count <= 0 || !indexLetter) continue;
    items.push({ main_artist, count, indexLetter });
  }
  const letters = raw.letters.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (items.length === 0) return null;
  const embedded = extractSlugMetaFromSnapshotItems(raw.items);
  const countsBySlug = parseCountsBySlugMap(raw.countsBySlug) ?? embedded.countsBySlug;
  const styleBySlug = parseStyleBySlugMap(raw.styleBySlug) ?? embedded.styleBySlug;
  if (!countsBySlug || !styleBySlug) return null;
  return { items, letters, countsBySlug, styleBySlug };
}

async function loadLibraryArtistIndexSnapshot(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter,
): Promise<{ payload: LibraryArtistIndexPayload; builtAtMs: number } | null> {
  if (snapshotTableMissing) return null;
  const { data, error } = await client
    .from(SNAPSHOT_TABLE)
    .select('items, letters, built_at')
    .eq('catalog', catalog)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') {
      snapshotTableMissing = true;
      return null;
    }
    console.warn('[library-artist-index] snapshot load', error.message);
    return null;
  }
  if (!data) return null;
  const payload = parseLibraryArtistIndexSnapshotPayload(data as { items?: unknown; letters?: unknown });
  if (!payload) return null;
  const builtAt =
    typeof (data as { built_at?: string }).built_at === 'string'
      ? Date.parse((data as { built_at: string }).built_at)
      : NaN;
  if (!Number.isFinite(builtAt)) return null;
  return { payload, builtAtMs: builtAt };
}

async function saveLibraryArtistIndexSnapshot(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter,
  payload: LibraryArtistIndexPayload,
): Promise<void> {
  if (snapshotTableMissing) return;
  const { error } = await client.from(SNAPSHOT_TABLE).upsert(
    {
      catalog,
      items: embedSlugMetaInSnapshotItems(payload.items, payload.countsBySlug, payload.styleBySlug),
      letters: payload.letters,
      item_count: payload.items.length,
      built_at: new Date().toISOString(),
    },
    { onConflict: 'catalog' },
  );
  if (error) {
    if (error.code === '42P01') {
      snapshotTableMissing = true;
      return;
    }
    console.warn('[library-artist-index] snapshot save', error.message);
  }
}

async function deleteLibraryArtistIndexSnapshots(): Promise<void> {
  if (snapshotTableMissing) return;
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from(SNAPSHOT_TABLE).delete().in('catalog', [...LIBRARY_CATALOG_FILTERS]);
  if (error) {
    if (error.code === '42P01') {
      snapshotTableMissing = true;
      return;
    }
    console.warn('[library-artist-index] snapshot delete', error.message);
  }
}

/** `songs` 全行を走査してアーティスト索引を構築（`catalog` で洋楽 / 邦楽 / すべて） */
export async function buildLibraryArtistIndex(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter = 'western',
): Promise<LibraryArtistIndexPayload> {
  await ensureWesternTreatedJpArtistCache();
  const songIdsByArtist = new Map<string, ArtistIndexBucket>();
  const registerSong = (artistLabel: string, songId: string) => {
    const primary = primaryArtistForLibraryIndex(artistLabel);
    const key = artistIndexKey(primary === '(表示なし)' ? '' : primary);
    if (!key) return;

    let bucket = songIdsByArtist.get(key);
    if (!bucket) {
      bucket = { display: primary, songIds: new Set() };
      songIdsByArtist.set(key, bucket);
    } else {
      bucket.display = mergeArtistDisplayName(bucket.display, primary);
    }
    bucket.songIds.add(songId);
  };

  const songIdsBySlug = new Map<string, Set<string>>();
  const styleTalliesBySlug = new Map<string, Map<Music8NavStyleSlug, number>>();
  const rows = filterSongRowsByLibraryCatalog(await fetchAllSongRowsForArtistAggregation(client), catalog);
  const catalogSongIds = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    registerSong(r.main_artist ?? '', r.id);
    const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
    if (!slug) continue;
    let ids = songIdsBySlug.get(slug);
    if (!ids) {
      ids = new Set();
      songIdsBySlug.set(slug, ids);
    }
    ids.add(r.id);
    const style = songNavStyleSlugFromColumn(r.style);
    if (!style) continue;
    let tallies = styleTalliesBySlug.get(slug);
    if (!tallies) {
      tallies = new Map();
      styleTalliesBySlug.set(slug, tallies);
    }
    tallies.set(style, (tallies.get(style) ?? 0) + 1);
  }

  try {
    const creditRows = await fetchAllSongCreditRowsForArtistAggregation(client);
    for (const r of creditRows) {
      if (!catalogSongIds.has(r.song_id)) continue;
      registerSong(r.artist_name, r.song_id);
    }
  } catch (e) {
    console.warn('[buildLibraryArtistIndex] song_credits skipped', e);
  }

  const counts = new Map<string, number>();
  for (const [, bucket] of songIdsByArtist) {
    counts.set(bucket.display, bucket.songIds.size);
  }

  const items: LibraryArtistIndexItem[] = mergeLibraryArtistIndexItems(
    Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([main_artist, count]) => ({
        main_artist,
        count,
        indexLetter: indexLetterForArtist(main_artist === '(表示なし)' ? '' : main_artist),
      })),
  );

  items.sort((x, y) =>
    compareDisplayTitleCaseInsensitive(
      stripLeadingArticleForSort(x.main_artist),
      stripLeadingArticleForSort(y.main_artist),
    ),
  );

  const letters = Array.from(new Set(items.map((i) => i.indexLetter))).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'en');
  });

  const countsBySlug: Record<string, number> = {};
  for (const [slug, ids] of songIdsBySlug) {
    countsBySlug[slug] = ids.size;
  }
  const styleBySlug: Record<string, Music8NavStyleSlug> = {};
  for (const [slug, tallies] of styleTalliesBySlug) {
    const dominant = pickDominantNavStyleSlug(tallies);
    if (dominant) styleBySlug[slug] = dominant;
  }

  return { items, letters, countsBySlug, styleBySlug };
}

async function rebuildAndPersistLibraryArtistIndex(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter,
): Promise<LibraryArtistIndexPayload> {
  const payload = await buildLibraryArtistIndex(client, catalog);
  indexCache.set(catalog, { builtAt: Date.now(), gen: INDEX_CACHE_GEN, payload });
  await saveLibraryArtistIndexSnapshot(client, catalog, payload);
  return payload;
}

function scheduleBackgroundRefresh(client: SupabaseClient, catalog: LibraryCatalogFilter): void {
  if (backgroundRefresh.has(catalog) || inFlight.has(catalog)) return;
  backgroundRefresh.add(catalog);
  void (async () => {
    try {
      const existing = inFlight.get(catalog);
      if (existing) {
        await existing;
        return;
      }
      const pending = rebuildAndPersistLibraryArtistIndex(client, catalog).finally(() => {
        inFlight.delete(catalog);
      });
      inFlight.set(catalog, pending);
      await pending;
    } catch (e) {
      console.warn('[library-artist-index] background refresh', e);
    } finally {
      backgroundRefresh.delete(catalog);
    }
  })();
}

/**
 * 部屋ライブラリ用アーティスト索引。
 * 1) プロセスメモリ → 2) DB スナップショット → 3) 全件走査で再構築。
 * スナップショット期限切れ時は stale を即返し、裏で再構築する。
 * テーブル未作成時は従来どおりメモリのみ。
 */
export async function getLibraryArtistIndexCached(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter = 'western',
): Promise<LibraryArtistIndexPayload> {
  const now = Date.now();
  const cached = indexCache.get(catalog);
  if (cached && cached.gen === INDEX_CACHE_GEN && now - cached.builtAt < INDEX_MEMORY_TTL_MS) {
    return cached.payload;
  }

  const existing = inFlight.get(catalog);
  if (existing) return existing;

  const pending = (async () => {
    const snapshot = await loadLibraryArtistIndexSnapshot(client, catalog);
    if (snapshot) {
      indexCache.set(catalog, { builtAt: Date.now(), gen: INDEX_CACHE_GEN, payload: snapshot.payload });
      const age = Date.now() - snapshot.builtAtMs;
      if (age >= INDEX_SNAPSHOT_TTL_MS) {
        scheduleBackgroundRefresh(client, catalog);
      }
      return snapshot.payload;
    }
    return rebuildAndPersistLibraryArtistIndex(client, catalog);
  })().finally(() => {
    inFlight.delete(catalog);
  });

  inFlight.set(catalog, pending);
  return pending;
}

/** 管理・スクリプト用: 指定 catalog（省略時は全 catalog）を強制再構築してスナップショット保存 */
export async function rebuildLibraryArtistIndexSnapshots(
  client: SupabaseClient,
  catalogs: LibraryCatalogFilter[] = [...LIBRARY_CATALOG_FILTERS],
): Promise<{ catalog: LibraryCatalogFilter; itemCount: number }[]> {
  snapshotTableMissing = false;
  const out: { catalog: LibraryCatalogFilter; itemCount: number }[] = [];
  for (const catalog of catalogs) {
    const payload = await rebuildAndPersistLibraryArtistIndex(client, catalog);
    out.push({ catalog, itemCount: payload.items.length });
  }
  return out;
}
