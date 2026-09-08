/**
 * 管理・曲詳細: 単独アーティストの vocal 候補と、ジャンル傾向の集計。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';

export type AdminSuggestedGenre = { name: string; count: number };

/** `R&amp;B` と `R&B` を同一ジャンルとして扱う */
export function normalizeCatalogGenreName(raw: string): string {
  let t = (raw ?? '').trim();
  if (!t) return '';
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#38;/g, '&')
      .replace(/&#x26;/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function catalogGenreKey(name: string): string {
  return normalizeCatalogGenreName(name).toLowerCase();
}

export function uniqueNormalizedGenreNames(names: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const name = normalizeCatalogGenreName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const VOCAL_LABELS = ['F', 'M', 'F,M'] as const;
export type AdminVocalLabel = (typeof VOCAL_LABELS)[number];

export function isSingleMainArtistName(
  mainArtist: string | null | undefined,
  creditCount: number,
): boolean {
  if (creditCount > 1) return false;
  const a = (mainArtist ?? '').trim();
  if (!a) return false;
  if (/\b(feat\.?|ft\.?|featuring)\b/i.test(a)) return false;
  if (/\s+x\s+/i.test(a)) return false;
  if (/\s+&\s+/.test(a) || /\s+and\s+/i.test(a)) return false;
  if (a.includes(',')) {
    const parts = a
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length !== 2) return false;
    return /^(The|A|An|Los|Las|Le|La)\b/i.test(parts[1]);
  }
  return true;
}

export function pickMajorityVocal(
  rawVocals: Array<string | null | undefined>,
): AdminVocalLabel | null {
  const counts: Record<AdminVocalLabel, number> = { F: 0, M: 0, 'F,M': 0 };
  for (const v of rawVocals) {
    const n = formatLibraryVocalDisplay(v);
    if (n === 'F' || n === 'M' || n === 'F,M') counts[n] += 1;
  }
  const ranked = VOCAL_LABELS.map((k) => [k, counts[k]] as const)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[1][1] === ranked[0][1]) return null;
  return ranked[0][0];
}

/** `songs.vocal` が空のとき、中間テーブル `song_vocals` の値を使う */
export function mergeSongVocalHint(
  columnVocal: string | null | undefined,
  linkVocal: string | null | undefined,
): string | null {
  return formatLibraryVocalDisplay(columnVocal) || formatLibraryVocalDisplay(linkVocal);
}

export function countGenreFrequencies(
  lists: Array<string[] | null | undefined>,
): AdminSuggestedGenre[] {
  const map = new Map<string, AdminSuggestedGenre>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const name = normalizeCatalogGenreName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'));
}

export function genreAlphabetInitial(name: string): string {
  const c = normalizeCatalogGenreName(name).charAt(0);
  if (/[A-Za-z]/.test(c)) return c.toUpperCase();
  return '#';
}

export function groupGenresByInitial(names: string[]): { initial: string; names: string[] }[] {
  const buckets = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const raw of names) {
    const name = normalizeCatalogGenreName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const initial = genreAlphabetInitial(name);
    const arr = buckets.get(initial) ?? [];
    arr.push(name);
    buckets.set(initial, arr);
  }
  const initials = [...buckets.keys()].sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'en');
  });
  return initials.map((initial) => ({
    initial,
    names: (buckets.get(initial) ?? []).sort((a, b) => a.localeCompare(b, 'en')),
  }));
}

type ArtistSongRow = {
  id?: string;
  vocal?: string | null;
  genres?: string[] | null;
};

export async function fetchArtistSongDefaultsForAdmin(
  admin: SupabaseClient,
  opts: {
    songId: string;
    artistId: string | null;
    mainArtist: string | null;
    creditCount: number;
  },
): Promise<{
  suggestedVocal: AdminVocalLabel | null;
  suggestedGenres: AdminSuggestedGenre[];
  allGenres: string[];
}> {
  const empty = {
    suggestedVocal: null as AdminVocalLabel | null,
    suggestedGenres: [] as AdminSuggestedGenre[],
    allGenres: [] as string[],
  };

  let allGenres: string[] = [];
  const { data: catalogRows, error: catalogErr } = await admin
    .from('catalog_genres')
    .select('name')
    .order('name')
    .limit(2000);
  if (!catalogErr && Array.isArray(catalogRows)) {
    const seen = new Set<string>();
    for (const row of catalogRows as { name?: string }[]) {
      const name = typeof row.name === 'string' ? normalizeCatalogGenreName(row.name) : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      allGenres.push(name);
    }
  }

  const artistId = opts.artistId?.trim() || null;
  const mainArtist = opts.mainArtist?.trim() || null;
  if (!artistId && !mainArtist) {
    return { ...empty, allGenres };
  }

  let query = admin
    .from('songs')
    .select('id, vocal, genres')
    .neq('id', opts.songId)
    .limit(1000);
  if (artistId) {
    query = query.eq('artist_id', artistId);
  } else if (mainArtist) {
    query = query.ilike('main_artist', mainArtist);
  }

  const { data, error } = await query;
  let rows = (!error && Array.isArray(data) ? data : []) as ArtistSongRow[];

  if (artistId && mainArtist && rows.length < 8) {
    const extra = await admin
      .from('songs')
      .select('id, vocal, genres')
      .neq('id', opts.songId)
      .ilike('main_artist', mainArtist)
      .limit(1000);
    if (!extra.error && Array.isArray(extra.data)) {
      const seen = new Set(rows.map((r) => r.id).filter(Boolean));
      for (const row of extra.data as ArtistSongRow[]) {
        if (row.id && seen.has(row.id)) continue;
        if (row.id) seen.add(row.id);
        rows.push(row);
      }
    }
  }

  let suggestedGenres = countGenreFrequencies(rows.map((r) => r.genres ?? null));
  if (suggestedGenres.length === 0) {
    const ids = rows.map((r) => r.id).filter((id): id is string => Boolean(id));
    const genreLists: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: linkRows, error: linkErr } = await admin
        .from('song_genres')
        .select('song_id, catalog_genres(name)')
        .in('song_id', chunk);
      if (linkErr || !Array.isArray(linkRows)) break;
      const bySong = new Map<string, string[]>();
      for (const row of linkRows as {
        song_id?: string;
        catalog_genres?: { name?: string } | { name?: string }[] | null;
      }[]) {
        const sid = row.song_id?.trim();
        if (!sid) continue;
        const nested = row.catalog_genres;
        const name = Array.isArray(nested) ? nested[0]?.name : nested?.name;
        const trimmed = typeof name === 'string' ? normalizeCatalogGenreName(name) : '';
        if (!trimmed) continue;
        const arr = bySong.get(sid) ?? [];
        arr.push(trimmed);
        bySong.set(sid, arr);
      }
      genreLists.push(...bySong.values());
    }
    if (genreLists.length > 0) suggestedGenres = countGenreFrequencies(genreLists);
  }
  if (allGenres.length === 0) {
    allGenres = suggestedGenres.map((g) => g.name);
  } else {
    const seen = new Set(allGenres.map((n) => catalogGenreKey(n)));
    for (const g of suggestedGenres) {
      const key = catalogGenreKey(g.name);
      if (key && !seen.has(key)) {
        allGenres.push(normalizeCatalogGenreName(g.name));
        seen.add(key);
      }
    }
  }

  const vocalBySongId = await fetchVocalLabelsFromSongVocals(
    admin,
    rows.map((r) => r.id).filter((id): id is string => Boolean(id)),
  );
  const suggestedVocal = isSingleMainArtistName(mainArtist, opts.creditCount)
    ? pickMajorityVocal(
        rows.map((r) => mergeSongVocalHint(r.vocal, r.id ? vocalBySongId.get(r.id) ?? null : null)),
      )
    : null;

  return { suggestedVocal, suggestedGenres, allGenres };
}

async function fetchVocalLabelsFromSongVocals(
  admin: SupabaseClient,
  songIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const namesBySong = new Map<string, string[]>();
  const uniq = [...new Set(songIds.map((id) => id.trim()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const { data, error } = await admin
      .from('song_vocals')
      .select('song_id, catalog_vocals(name)')
      .in('song_id', chunk);
    if (error) {
      if (error.code !== '42P01' && error.code !== '42703') {
        console.warn('[admin-song-artist-defaults] song_vocals', error.message);
      }
      break;
    }
    for (const row of (data ?? []) as {
      song_id?: string;
      catalog_vocals?: { name?: string } | { name?: string }[] | null;
    }[]) {
      const sid = row.song_id?.trim();
      if (!sid) continue;
      const nested = row.catalog_vocals;
      const name = Array.isArray(nested) ? nested[0]?.name : nested?.name;
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) continue;
      const arr = namesBySong.get(sid) ?? [];
      arr.push(trimmed);
      namesBySong.set(sid, arr);
    }
  }
  for (const [sid, names] of namesBySong) {
    out.set(sid, formatLibraryVocalDisplay(names.join(',')));
  }
  return out;
}
