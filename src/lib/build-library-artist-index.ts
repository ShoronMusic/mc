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
};

type ArtistIndexBucket = {
  display: string;
  songIds: Set<string>;
};

/** プロセス内メモリキャッシュ（同一インスタンスの連続アクセス用） */
const INDEX_MEMORY_TTL_MS = 15 * 60 * 1000;
/** DB スナップショットの鮮度。切れても stale-while-revalidate で先に返し、裏で再構築する */
const INDEX_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const SNAPSHOT_TABLE = 'library_artist_index_snapshots';

const indexCache = new Map<
  LibraryCatalogFilter,
  { builtAt: number; payload: LibraryArtistIndexPayload }
>();

const inFlight = new Map<LibraryCatalogFilter, Promise<LibraryArtistIndexPayload>>();
const backgroundRefresh = new Set<LibraryCatalogFilter>();

let snapshotTableMissing = false;

export function clearLibraryArtistIndexCache(): void {
  indexCache.clear();
  // 進行中の再構築結果が古い判定で上書きされないよう、完了後にメモリへ載せる前に clear 済みなら捨てる
  for (const catalog of LIBRARY_CATALOG_FILTERS) {
    backgroundRefresh.delete(catalog);
  }
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

/** jsonb スナップショットを安全にパース（破損行は null） */
export function parseLibraryArtistIndexSnapshotPayload(raw: {
  items?: unknown;
  letters?: unknown;
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
  return { items, letters };
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
      items: payload.items,
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

  const rows = filterSongRowsByLibraryCatalog(await fetchAllSongRowsForArtistAggregation(client), catalog);
  const catalogSongIds = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    registerSong(r.main_artist ?? '', r.id);
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

  return { items, letters };
}

async function rebuildAndPersistLibraryArtistIndex(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter,
): Promise<LibraryArtistIndexPayload> {
  const payload = await buildLibraryArtistIndex(client, catalog);
  indexCache.set(catalog, { builtAt: Date.now(), payload });
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
  if (cached && now - cached.builtAt < INDEX_MEMORY_TTL_MS) {
    return cached.payload;
  }

  const existing = inFlight.get(catalog);
  if (existing) return existing;

  const pending = (async () => {
    const snapshot = await loadLibraryArtistIndexSnapshot(client, catalog);
    if (snapshot) {
      indexCache.set(catalog, { builtAt: Date.now(), payload: snapshot.payload });
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
