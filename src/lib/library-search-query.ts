import type { SupabaseClient } from '@supabase/supabase-js';
import { stripLeadingArticleForSort } from '@/lib/admin-library-index';
import {
  artistAliasesContainsOrFilter,
  expandArtistSearchNicknameVariants,
  resolveArtistSearchNicknameCanonical,
} from '@/lib/artist-search-nicknames';

/**
 * ライブラリ検索（`/api/library/search`）用クエリ展開。
 * 日本語カタカナ表記ゆれ（・／スペース／スウィフト↔スイフト）、
 * 愛称マスタ（`artist-search-nicknames.json`）、代表英語名の補完。
 */

/** カタカナ検索から追加する英語 main_artist */
const KATAKANA_MAIN_ARTIST_HINTS: { test: (compact: string) => boolean; names: string[] }[] = [
  {
    test: (c) =>
      /テイラー/.test(c) &&
      (/スウィフト/.test(c) || /スイフト/.test(c) || /スィフト/.test(c) || /スウィフト/.test(c)),
    names: ['Taylor Swift'],
  },
  {
    test: (c) => /^(ザ)?ビートルズ$/.test(c),
    names: ['The Beatles'],
  },
  {
    test: (c) => /^(ザ)?スミス$/.test(c),
    names: ['The Smiths'],
  },
];

function compactJa(s: string): string {
  return s.replace(/[・･\u30FB\s\u3000]+/g, '').trim();
}

/** 日本語カタカナ／略称から優先表示する英語 `main_artist`（検索 API の並び替えにも使用） */
export function resolveLibrarySearchPriorityArtistNames(rawQuery: string): string[] {
  const q = rawQuery.trim();
  if (!q) return [];

  const names = new Set<string>();
  const nicknameCanonical = resolveArtistSearchNicknameCanonical(q);
  if (nicknameCanonical) names.add(nicknameCanonical);
  const compact = compactJa(q);
  for (const hint of KATAKANA_MAIN_ARTIST_HINTS) {
    if (hint.test(compact)) {
      for (const name of hint.names) names.add(name);
    }
  }
  if (/^smiths?$/i.test(q)) names.add('The Smiths');
  return [...names];
}

/** スウィフト ↔ スイフト 等のカタカナゆれ */
function katakanaWiSuVariants(s: string): string[] {
  const out: string[] = [];
  if (s.includes('ウィ')) out.push(s.replace(/ウィ/g, 'イ'));
  if (s.includes('スイ') && !s.includes('スウィ')) out.push(s.replace(/スイ/g, 'スウィ'));
  if (s.includes('スィ')) out.push(s.replace(/スィ/g, 'スイ'), s.replace(/スィ/g, 'スウィ'));
  return out;
}

/**
 * DB `ilike` 用の検索語バリエーション（最大 max 件）。
 */
export function expandLibrarySearchQueryVariants(raw: string, max = 12): string[] {
  const q = raw.trim();
  if (!q) return [];

  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t.length >= 1) out.add(t);
  };

  add(q);
  add(compactJa(q));

  const seed = [...out];
  for (const base of seed) {
    for (const v of katakanaWiSuVariants(base)) add(v);
  }

  for (const name of resolveLibrarySearchPriorityArtistNames(q)) {
    add(name);
  }
  for (const name of expandArtistSearchNicknameVariants(q)) {
    add(name);
  }

  return [...out].slice(0, max);
}

export function escapeLikeForIlike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** `main_artist` のカンマ／&／and 区切り（共演・デュエット） */
const MAIN_ARTIST_COLLAB_SPLIT = /\s*,\s*|\s+&\s+|\s+and\s+/i;

/** 共演表記を個別アーティスト名に分解（1名のときはその1件） */
export function parseCollabArtistNamesFromMainArtist(mainArtist: string): string[] {
  const s = mainArtist.trim();
  if (!s) return [];
  const parts = s.split(MAIN_ARTIST_COLLAB_SPLIT).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [s];
}

/**
 * ライブラリ索引の集計キー用：共演表記は先頭アーティストに寄せる。
 * 例: `Calvin Harris, Dua Lipa` → `Calvin Harris`
 */
export function primaryArtistForLibraryIndex(mainArtist: string): string {
  const trimmed = mainArtist.trim();
  if (!trimmed) return '(表示なし)';
  const parts = parseCollabArtistNamesFromMainArtist(trimmed);
  return parts[0]?.trim() || trimmed;
}

/** 先頭 The/A/An を除いた表記でも同一アーティストとみなす（Beatles ↔ The Beatles） */
export function artistNamesMatchIgnoringLeadingArticle(a: string, b: string): boolean {
  const x = stripLeadingArticleForSort(a).trim();
  const y = stripLeadingArticleForSort(b).trim();
  if (!x || !y) return false;
  return x.localeCompare(y, undefined, { sensitivity: 'base' }) === 0;
}

/** `main_artist` 検索用: 入力名と先頭冠詞あり／なしの表記バリエーション */
export function libraryArtistNameLookupVariants(name: string): string[] {
  const s = name.trim();
  if (!s) return [];
  const out = new Set<string>([s]);
  const stripped = stripLeadingArticleForSort(s);
  if (stripped && stripped !== s) out.add(stripped);
  if (stripped && !/^the\s+/i.test(s)) {
    const theForm = `The ${stripped}`;
    if (theForm !== s) out.add(theForm);
  }
  return [...out];
}

function libraryArtistDisplayNameKey(name: string): string {
  return stripLeadingArticleForSort(name).trim().toLowerCase();
}

/** 同一アーティストの表記ゆれ（Beatles / The Beatles）を1件にまとめるときの代表名 */
export function preferLibraryArtistDisplayName(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  if (!x) return y;
  if (!y) return x;
  if (libraryArtistDisplayNameKey(x) !== libraryArtistDisplayNameKey(y)) return x;
  if (/^the\s+/i.test(y) && !/^the\s+/i.test(x)) return y;
  if (/^the\s+/i.test(x) && !/^the\s+/i.test(y)) return x;
  return x.localeCompare(y, 'en', { sensitivity: 'base' }) <= 0 ? x : y;
}

/** ライブラリ UI 用: 先頭冠詞ゆれを除いてアーティスト名をユニーク化 */
export function dedupeLibraryArtistDisplayNames(names: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = libraryArtistDisplayNameKey(name);
    const existing = byKey.get(key);
    byKey.set(key, existing ? preferLibraryArtistDisplayName(existing, name) : name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/** 検索結果のアーティスト一覧: 曲数の多い順、同数は名前順 */
export function compareLibrarySearchArtistRowsByCountDesc(
  a: { main_artist: string; count: number },
  b: { main_artist: string; count: number },
): number {
  if (b.count !== a.count) return b.count - a.count;
  return a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' });
}

export type LibraryArtistIndexMergeItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

/** 索引 API 応答: Beatles / The Beatles などを1行に統合（曲数は合算） */
export function mergeLibraryArtistIndexItems(
  items: LibraryArtistIndexMergeItem[],
): LibraryArtistIndexMergeItem[] {
  const byKey = new Map<string, LibraryArtistIndexMergeItem>();
  for (const item of items) {
    const name = (item.main_artist ?? '').trim();
    if (!name) continue;
    const key = libraryArtistDisplayNameKey(name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, main_artist: name });
      continue;
    }
    existing.count += item.count;
    existing.main_artist = preferLibraryArtistDisplayName(existing.main_artist, name);
    existing.indexLetter = item.indexLetter || existing.indexLetter;
  }
  return [...byKey.values()].sort((a, b) =>
    a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' }),
  );
}

/**
 * 曲の `main_artist` が、絞り込みで選んだ単独アーティスト名に該当するか。
 * 完全一致または共演列のいずれかと一致（部分文字列マッチはしない）。
 */
export function songMainArtistIncludesArtist(
  songMainArtist: string | null | undefined,
  selectedArtist: string,
): boolean {
  const sel = selectedArtist.trim();
  if (!sel) return true;
  const raw = (songMainArtist ?? '').trim();
  if (!raw) return false;
  if (raw.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0) return true;
  if (artistNamesMatchIgnoringLeadingArticle(raw, sel)) return true;
  const parts = parseCollabArtistNamesFromMainArtist(raw);
  return parts.some(
    (p) =>
      p.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0 ||
      artistNamesMatchIgnoringLeadingArticle(p, sel),
  );
}

/** 検索結果の「アーティストで絞り込み」候補（結合表記＋個別名） */
export function expandMainArtistNamesForLibraryFilter(mainArtist: string): string[] {
  const s = mainArtist.trim();
  if (!s) return [];
  const out = new Set<string>([s]);
  for (const p of parseCollabArtistNamesFromMainArtist(s)) {
    if (p) out.add(p);
  }
  return [...out];
}

type SongRowWithMainArtist = { id: string; main_artist: string | null };

/**
 * 入力順の結果を保ったまま、同時実行数を絞って並行処理する。
 * Supabase へ一度に投げすぎないよう、検索系の直列ループはこれで置き換える。
 */
export async function mapWithLimitedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

/** 検索 1 回で Supabase へ同時に投げるクエリ数の上限 */
export const LIBRARY_SEARCH_QUERY_CONCURRENCY = 4;
/** アーティスト 1 件あたり複数クエリが走るので、アーティスト単位はさらに絞る */
export const LIBRARY_SEARCH_ARTIST_CONCURRENCY = 3;

/** indexed_pick: 索引からの確定名（広い %…% を避ける）。search_broad: キーワード検索用 */
export type FetchSongsForLibraryArtistMode = 'indexed_pick' | 'search_broad';

/** `artists.name` の大文字小文字無視完全一致で ID を解決 */
export async function resolveArtistIdsForLibrarySelection(
  admin: SupabaseClient,
  artistName: string,
): Promise<string[]> {
  const sel = artistName.trim();
  if (!sel) return [];

  const escaped = escapeLikeForIlike(sel);
  const { data, error } = await admin.from('artists').select('id, name').ilike('name', escaped).limit(24);
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  const ids: string[] = [];
  for (const row of (data ?? []) as { id?: string; name?: string }[]) {
    if (!row.id) continue;
    const n = (row.name ?? '').trim();
    if (
      n.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0 ||
      artistNamesMatchIgnoringLeadingArticle(n, sel)
    ) {
      ids.push(row.id);
    }
  }
  return ids;
}

/** 1 アーティストあたりに引き当てる `artists.id` の上限（単体版 `.limit(24)` と揃える） */
const ARTIST_ID_LIMIT_PER_NAME = 24;
/** 一括クエリ 1 本に載せる `in(...)` の要素数 */
const BATCH_IN_CHUNK_ARTIST_IDS = 100;
const BATCH_IN_CHUNK_SONG_IDS = 400;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `resolveArtistIdsForLibrarySelection` と同じ突き合わせ規則 */
function artistRowMatchesRequestedName(rowName: string, requested: string): boolean {
  const n = rowName.trim();
  if (!n) return false;
  return (
    n.localeCompare(requested, undefined, { sensitivity: 'base' }) === 0 ||
    artistNamesMatchIgnoringLeadingArticle(n, requested)
  );
}

/**
 * 複数アーティスト名の `song_credits` 経由の曲を **まとめて**取得する。
 * アーティストごとに `artists` → `song_credits` → `songs` を逐次で叩くと
 * 候補が多い検索語（例: 「love」で 30 件以上）で往復回数が支配的になるため、
 * 検索 API はこちらを使って 1 名あたりの結果に振り分ける。
 *
 * 取得できなかった名前は戻り値のキーに含めない（呼び出し側が従来の単体経路にフォールバックできる）。
 */
export async function fetchCreditSongsForLibraryArtistNamesBatch<T extends SongRowWithMainArtist>(
  admin: SupabaseClient,
  names: string[],
  select: string,
  limitPerArtist: number,
): Promise<Map<string, T[]>> {
  const requested = names.map((n) => n.trim()).filter((n) => n.length > 0);
  const byName = new Map<string, T[]>();
  if (requested.length === 0) return byName;

  // 表記ゆれ（The … あり／なし）も同じクエリに載せて 1 往復で引く。
  const lookupNames = [
    ...new Set(requested.flatMap((n) => libraryArtistNameLookupVariants(n))),
  ];

  const artistRows: { id?: string; name?: string }[] = [];
  for (const chunk of chunkArray(lookupNames, BATCH_IN_CHUNK_ARTIST_IDS)) {
    const { data, error } = await admin
      .from('artists')
      .select('id, name')
      .in('name', chunk)
      .limit(chunk.length * ARTIST_ID_LIMIT_PER_NAME);
    if (error) {
      if (error.code === '42P01') return byName;
      throw new Error(error.message);
    }
    artistRows.push(...((data ?? []) as { id?: string; name?: string }[]));
  }

  const artistIdsByName = new Map<string, string[]>();
  for (const name of requested) {
    const ids: string[] = [];
    for (const row of artistRows) {
      if (!row.id || typeof row.name !== 'string') continue;
      if (!artistRowMatchesRequestedName(row.name, name)) continue;
      if (!ids.includes(row.id)) ids.push(row.id);
      if (ids.length >= ARTIST_ID_LIMIT_PER_NAME) break;
    }
    // 大文字小文字が違うだけの行は `in(...)` では拾えない。空の名前は呼び出し側の単体経路に任せる。
    if (ids.length > 0) artistIdsByName.set(name, ids);
  }
  if (artistIdsByName.size === 0) return byName;

  const allArtistIds = [...new Set([...artistIdsByName.values()].flat())];
  const songIdsByArtistId = new Map<string, string[]>();
  for (const chunk of chunkArray(allArtistIds, BATCH_IN_CHUNK_ARTIST_IDS)) {
    const { data, error } = await admin
      .from('song_credits')
      .select('song_id, artist_id')
      .in('artist_id', chunk)
      .limit(Math.min(chunk.length * limitPerArtist * 4, 8000));
    if (error) {
      if (error.code === '42P01') return byName;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as { song_id?: string; artist_id?: string }[]) {
      if (!row.song_id || !row.artist_id) continue;
      const list = songIdsByArtistId.get(row.artist_id) ?? [];
      list.push(row.song_id);
      songIdsByArtistId.set(row.artist_id, list);
    }
  }

  const songIdsByName = new Map<string, string[]>();
  const neededSongIds = new Set<string>();
  for (const [name, ids] of artistIdsByName) {
    const songIds = [
      ...new Set(ids.flatMap((id) => songIdsByArtistId.get(id) ?? [])),
    ].slice(0, limitPerArtist);
    songIdsByName.set(name, songIds);
    for (const id of songIds) neededSongIds.add(id);
  }

  const songById = new Map<string, T>();
  const songIdChunks = chunkArray([...neededSongIds], BATCH_IN_CHUNK_SONG_IDS);
  const chunkResults = await mapWithLimitedConcurrency(
    songIdChunks,
    LIBRARY_SEARCH_QUERY_CONCURRENCY,
    async (chunk) => {
      const { data, error } = await admin.from('songs').select(select).in('id', chunk).limit(chunk.length);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as T[];
    },
  );
  for (const rows of chunkResults) {
    for (const row of rows) {
      if (row?.id) songById.set(row.id, row);
    }
  }

  for (const [name, songIds] of songIdsByName) {
    byName.set(
      name,
      songIds.map((id) => songById.get(id)).filter((row): row is T => Boolean(row)),
    );
  }
  return byName;
}

/** `song_credits` 経由でアーティストに紐づく曲（feat. 等のサブクレジット含む） */
export async function fetchSongsLinkedViaSongCredits<T extends SongRowWithMainArtist>(
  admin: SupabaseClient,
  artistIds: string[],
  select: string,
  limit: number,
): Promise<T[]> {
  if (artistIds.length === 0) return [];

  const { data: credits, error: credErr } = await admin
    .from('song_credits')
    .select('song_id')
    .in('artist_id', artistIds)
    .limit(Math.min(limit * 4, 2000));
  if (credErr) {
    if (credErr.code === '42P01') return [];
    throw new Error(credErr.message);
  }

  const songIds = [
    ...new Set(
      (credits ?? [])
        .map((c) => (c as { song_id?: string }).song_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ].slice(0, limit);
  if (songIds.length === 0) return [];

  const { data: songs, error: songErr } = await admin.from('songs').select(select).in('id', songIds).limit(limit);
  if (songErr) throw new Error(songErr.message);
  return (songs ?? []) as unknown as T[];
}

/**
 * 単独アーティスト名で曲を取得（ソロ＋「A, B」共演のいずれかに含まれる行）。
 */
export async function fetchSongsForLibraryArtistSelection<T extends SongRowWithMainArtist>(
  admin: SupabaseClient,
  artist: string,
  select: string,
  limit: number,
  mode: FetchSongsForLibraryArtistMode = 'search_broad',
  /**
   * `fetchCreditSongsForLibraryArtistNamesBatch` で先に一括取得した `song_credits` 経由の曲。
   * 渡されたときは `artists` → `song_credits` → `songs` の 3 クエリを省く。
   */
  creditSongsOverride?: T[] | null,
): Promise<T[]> {
  const sel = artist.trim();
  if (!sel) return [];

  const byId = new Map<string, T>();
  const addFromMainArtist = (rows: unknown) => {
    const list = (Array.isArray(rows) ? rows : []) as unknown as T[];
    for (const row of list) {
      if (!row?.id || !songMainArtistIncludesArtist(row.main_artist, sel)) continue;
      byId.set(row.id, row);
    }
  };
  const addAny = (rows: unknown) => {
    const list = (Array.isArray(rows) ? rows : []) as unknown as T[];
    for (const row of list) {
      if (!row?.id) continue;
      byId.set(row.id, row);
    }
  };

  const escaped = escapeLikeForIlike(sel);

  const searchMainArtistByPattern = async (pattern: string, rowLimit: number) => {
    const { data, error } = await admin.from('songs').select(select).ilike('main_artist', pattern).limit(rowLimit);
    if (error) throw new Error(error.message);
    return data;
  };

  // Postgres の eq は大文字小文字を区別する。登録時の Title Case 化（Mrs. GREEN → Mrs. Green）と
  // artists.name の表記ゆれで一覧が空になるのを防ぐため、完全一致は ILIKE にする。
  const exactPatterns = libraryArtistNameLookupVariants(sel).map((variant) => escapeLikeForIlike(variant));
  const broadPatterns: { pattern: string; rowLimit: number }[] =
    mode === 'indexed_pick'
      ? [`${escaped},%`, `%, ${escaped}`, `%, ${escaped},%`].map((pattern) => ({
          pattern,
          rowLimit: Math.min(limit, 150),
        }))
      : [{ pattern: `%${escaped}%`, rowLimit: Math.min(limit * 4, 400) }];

  // 互いに依存しないので並行実行し、取り込み順だけ従来どおりに保つ。
  const [exactResults, broadResults, creditSongs] = await Promise.all([
    Promise.all(exactPatterns.map((pattern) => searchMainArtistByPattern(pattern, limit))),
    Promise.all(broadPatterns.map((p) => searchMainArtistByPattern(p.pattern, p.rowLimit))),
    creditSongsOverride
      ? Promise.resolve(creditSongsOverride)
      : (async () => {
          const artistIds = await resolveArtistIdsForLibrarySelection(admin, sel);
          return fetchSongsLinkedViaSongCredits<T>(admin, artistIds, select, limit);
        })(),
  ]);

  for (const rows of exactResults) addFromMainArtist(rows);
  for (const rows of broadResults) addFromMainArtist(rows);
  addAny(creditSongs);

  return [...byId.values()];
}

/** `artists.aliases` が無い DB では 42703 のあと列なし扱いにする */
let artistsAliasesColumnAvailable: boolean | null = null;

/** `artists.name_ja` / `name` / `aliases` の一致から main_artist（英語表記）を集める */
export async function resolveMainArtistsForLibrarySearch(
  admin: SupabaseClient,
  rawQuery: string,
): Promise<string[]> {
  const variants = expandLibrarySearchQueryVariants(rawQuery);
  if (variants.length === 0) return [];

  const perVariant = await mapWithLimitedConcurrency(
    variants,
    LIBRARY_SEARCH_QUERY_CONCURRENCY,
    async (v): Promise<{ name?: string }[]> => {
      const escaped = escapeLikeForIlike(v);
      const tryAliases = artistsAliasesColumnAvailable !== false;
      const aliasOr = tryAliases ? artistAliasesContainsOrFilter(v) : null;
      const orFilter = aliasOr
        ? `name_ja.ilike.%${escaped}%,name.ilike.%${escaped}%,${aliasOr}`
        : `name_ja.ilike.%${escaped}%,name.ilike.%${escaped}%`;
      const { data, error } = await admin
        .from('artists')
        .select('name, name_ja')
        .or(orFilter)
        .limit(40);
      if (error?.code === '42703') {
        if (tryAliases && aliasOr) artistsAliasesColumnAvailable = false;
        // aliases 未導入、または name_ja 無し
        const { data: withJa, error: jaErr } = await admin
          .from('artists')
          .select('name, name_ja')
          .or(`name_ja.ilike.%${escaped}%,name.ilike.%${escaped}%`)
          .limit(40);
        if (!jaErr) {
          if (artistsAliasesColumnAvailable === null) artistsAliasesColumnAvailable = false;
          return (withJa ?? []) as { name?: string }[];
        }
        const { data: fallback } = await admin.from('artists').select('name').ilike('name', `%${escaped}%`).limit(40);
        return (fallback ?? []) as { name?: string }[];
      }
      if (error) return [];
      if (tryAliases && aliasOr) artistsAliasesColumnAvailable = true;
      return (data ?? []) as { name?: string }[];
    },
  );

  const names = new Set<string>();
  for (const rows of perVariant) {
    for (const row of rows) {
      const n = row.name?.trim();
      if (n) names.add(n);
    }
  }
  const nicknameCanonical = resolveArtistSearchNicknameCanonical(rawQuery);
  if (nicknameCanonical) names.add(nicknameCanonical);

  // 曲名が artists.name に入り name_ja だけ正しいケース（Billie Jean←マイケル・ジャクソン 等）を、
  // 紐づく曲の支配的な main_artist へ寄せる。
  const rawNames = [...names];
  const canonical = await canonicalizeLibrarySearchArtistNames(admin, rawNames);
  return dedupeLibraryArtistDisplayNames(canonical);
}

/**
 * `song_credits` 経由の曲の `main_artist` 分布から、表示用の英語名を決める。
 * 要求名と一致する曲より「別の主アーティスト」が明らかに多いときだけ差し替える。
 */
export function pickCanonicalLibraryMainArtistName(
  requestedName: string,
  mainArtistCounts: Map<string, number>,
): string {
  const requested = requestedName.trim();
  if (!requested || mainArtistCounts.size === 0) return requested;

  let selfCount = 0;
  let bestName = '';
  let bestCount = 0;
  for (const [name, count] of mainArtistCounts) {
    const label = primaryArtistForLibraryIndex(name);
    if (!label || label === '(表示なし)') continue;
    if (
      songMainArtistIncludesArtist(label, requested) ||
      artistNamesMatchIgnoringLeadingArticle(label, requested)
    ) {
      selfCount += count;
    }
    if (count > bestCount) {
      bestCount = count;
      bestName = label;
    }
  }

  if (!bestName) return requested;
  if (
    songMainArtistIncludesArtist(bestName, requested) ||
    artistNamesMatchIgnoringLeadingArticle(bestName, requested)
  ) {
    return preferLibraryArtistDisplayName(requested, bestName);
  }
  // 例: artists.name=Billie Jean だが credits 先の曲はほぼ Michael Jackson
  if (bestCount >= 2 && bestCount > selfCount) return bestName;
  return requested;
}

/** 複数アーティスト名を、紐づく曲の支配的 `main_artist` に正規化（失敗時は入力名のまま） */
export async function canonicalizeLibrarySearchArtistNames(
  admin: SupabaseClient,
  names: string[],
): Promise<string[]> {
  const requested = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (requested.length === 0) return [];

  let creditSongsByName: Map<string, { id: string; main_artist: string | null }[]>;
  try {
    creditSongsByName = await fetchCreditSongsForLibraryArtistNamesBatch(
      admin,
      requested,
      'id, main_artist',
      80,
    );
  } catch (e) {
    console.warn('[canonicalizeLibrarySearchArtistNames]', e);
    return requested;
  }

  return requested.map((name) => {
    const rows = creditSongsByName.get(name) ?? [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = primaryArtistForLibraryIndex(row.main_artist ?? '');
      if (!label || label === '(表示なし)') continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return pickCanonicalLibraryMainArtistName(name, counts);
  });
}
