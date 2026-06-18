import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ライブラリ検索（`/api/library/search`）用クエリ展開。
 * 日本語カタカナ表記ゆれ（・／スペース／スウィフト↔スイフト）と代表英語名の補完。
 */

/** カタカナ検索から追加する英語 main_artist（部分一致） */
const KATAKANA_MAIN_ARTIST_HINTS: { test: (compact: string) => boolean; names: string[] }[] = [
  {
    test: (c) =>
      /テイラー/.test(c) &&
      (/スウィフト/.test(c) || /スイフト/.test(c) || /スィフト/.test(c) || /スウィフト/.test(c)),
    names: ['Taylor Swift'],
  },
];

function compactJa(s: string): string {
  return s.replace(/[・･\u30FB\s\u3000]+/g, '').trim();
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

  const compact = compactJa(q);
  for (const hint of KATAKANA_MAIN_ARTIST_HINTS) {
    if (hint.test(compact)) {
      for (const name of hint.names) add(name);
    }
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
  const parts = parseCollabArtistNamesFromMainArtist(raw);
  return parts.some((p) => p.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0);
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
    if (n.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0) ids.push(row.id);
  }
  return ids;
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

  const { data: exact, error: exactErr } = await admin
    .from('songs')
    .select(select)
    .eq('main_artist', sel)
    .limit(limit);
  if (exactErr) throw new Error(exactErr.message);
  addFromMainArtist(exact);

  const escaped = escapeLikeForIlike(sel);

  if (mode === 'indexed_pick') {
    const perPattern = Math.min(limit, 150);
    const collabPatterns = [`${escaped},%`, `%, ${escaped}`, `%, ${escaped},%`];
    for (const pat of collabPatterns) {
      const { data, error } = await admin
        .from('songs')
        .select(select)
        .ilike('main_artist', pat)
        .limit(perPattern);
      if (error) throw new Error(error.message);
      addFromMainArtist(data);
    }
  } else {
    const { data: fuzzy, error: fuzzyErr } = await admin
      .from('songs')
      .select(select)
      .ilike('main_artist', `%${escaped}%`)
      .limit(Math.min(limit * 4, 400));
    if (fuzzyErr) throw new Error(fuzzyErr.message);
    addFromMainArtist(fuzzy);
  }

  const artistIds = await resolveArtistIdsForLibrarySelection(admin, sel);
  const creditSongs = await fetchSongsLinkedViaSongCredits<T>(admin, artistIds, select, limit);
  addAny(creditSongs);

  return [...byId.values()];
}

/** `artists.name_ja` / `name` の部分一致から main_artist（英語表記）を集める */
export async function resolveMainArtistsForLibrarySearch(
  admin: SupabaseClient,
  rawQuery: string,
): Promise<string[]> {
  const variants = expandLibrarySearchQueryVariants(rawQuery);
  if (variants.length === 0) return [];

  const names = new Set<string>();
  for (const v of variants) {
    const escaped = escapeLikeForIlike(v);
    const { data, error } = await admin
      .from('artists')
      .select('name, name_ja')
      .or(`name_ja.ilike.%${escaped}%,name.ilike.%${escaped}%`)
      .limit(40);
    if (error?.code === '42703') {
      const { data: fallback } = await admin.from('artists').select('name').ilike('name', `%${escaped}%`).limit(40);
      for (const row of (fallback ?? []) as { name?: string }[]) {
        const n = row.name?.trim();
        if (n) names.add(n);
      }
      continue;
    }
    if (error) continue;
    for (const row of (data ?? []) as { name?: string }[]) {
      const n = row.name?.trim();
      if (n) names.add(n);
    }
  }
  return [...names];
}
