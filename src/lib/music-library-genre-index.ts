/**
 * Music Library ジャンル索引（`catalog_genres` / `song_genres`）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { indexLetterForArtist } from '@/lib/admin-library-index';
import { fetchAllSongRowsForArtistAggregation } from '@/lib/library-artist-count-rows';
import { isMusic8VocalClassificationToken } from '@/lib/music8-song-fields';
import {
  filterSongRowsByLibraryCatalog,
  type LibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import {
  musicLibraryGenreHref,
  musicLibraryGenreLetterParam,
  parseMusicLibraryArtistSearchQuery,
} from '@/lib/music-library-urls';

export type MusicLibraryGenreIndexEntry = {
  name: string;
  nameJa: string | null;
  slug: string;
  href: string;
  count: number;
  indexLetter: string;
};

const PAGE = 1000;
const INDEX_TTL_MS = 15 * 60 * 1000;
const INDEX_CACHE_GEN = 1;

const indexCache = new Map<
  LibraryCatalogFilter,
  { at: number; gen: number; items: MusicLibraryGenreIndexEntry[] }
>();

export function clearMusicLibraryGenreIndexCache(): void {
  indexCache.clear();
}

type CatalogGenreRow = {
  id: string;
  slug: string | null;
  name: string | null;
  name_ja: string | null;
};

export function filterMusicLibraryGenresByLetter(
  items: MusicLibraryGenreIndexEntry[],
  letterParam: string,
): MusicLibraryGenreIndexEntry[] {
  const want = musicLibraryGenreLetterParam(letterParam);
  return items.filter((it) => musicLibraryGenreLetterParam(it.indexLetter) === want);
}

export function filterMusicLibraryGenresBySearchQuery(
  items: MusicLibraryGenreIndexEntry[],
  rawQuery: string,
): MusicLibraryGenreIndexEntry[] {
  const q = parseMusicLibraryArtistSearchQuery(rawQuery);
  if (!q) return [];
  const needles = q
    .toLowerCase()
    .split(/\s+/)
    .map((n) => n.trim())
    .filter(Boolean);
  if (needles.length === 0) return [];
  return items.filter((it) => genreMatchesSearchNeedles(it, needles));
}

export function countMusicLibraryGenresByLetter(
  items: { indexLetter: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const it of items) {
    const letter = musicLibraryGenreLetterParam(it.indexLetter);
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

function genreMatchesSearchNeedles(item: MusicLibraryGenreIndexEntry, needles: string[]): boolean {
  const name = item.name.trim().toLowerCase();
  const nameJa = (item.nameJa ?? '').trim().toLowerCase();
  const slug = item.slug.trim().toLowerCase();
  const slugSpaced = slug.replace(/-/g, ' ');
  for (const n of needles) {
    if (!n) continue;
    if (name.includes(n) || nameJa.includes(n) || slug.includes(n) || slugSpaced.includes(n)) {
      continue;
    }
    return false;
  }
  return true;
}

function usableGenreName(name: string | null | undefined): string {
  return (name ?? '').trim();
}

export function toMusicLibraryGenreIndexEntry(input: {
  slug: string;
  name: string;
  nameJa?: string | null;
  count: number;
}): MusicLibraryGenreIndexEntry | null {
  const slug = input.slug.trim().toLowerCase();
  const name = usableGenreName(input.name);
  if (!slug || !name || isMusic8VocalClassificationToken(name)) return null;
  if (input.count <= 0) return null;
  return {
    name,
    nameJa: (input.nameJa ?? '').trim() || null,
    slug,
    href: musicLibraryGenreHref(slug, 1),
    count: input.count,
    indexLetter: indexLetterForArtist(name),
  };
}

async function fetchAllCatalogGenres(admin: SupabaseClient): Promise<CatalogGenreRow[]> {
  const out: CatalogGenreRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('catalog_genres')
      .select('id, slug, name, name_ja')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42P01') return [];
      throw new Error(error.message);
    }
    const batch = (data ?? []) as CatalogGenreRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function fetchGenreSongCounts(
  admin: SupabaseClient,
  inCatalogSongIds: Set<string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (inCatalogSongIds.size === 0) return counts;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('song_genres')
      .select('genre_id, song_id')
      .order('genre_id', { ascending: true })
      .order('song_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42P01') return counts;
      throw new Error(error.message);
    }
    const batch = (data ?? []) as { genre_id?: string; song_id?: string }[];
    for (const row of batch) {
      const genreId = row.genre_id;
      const songId = row.song_id;
      if (!genreId || !songId || !inCatalogSongIds.has(songId)) continue;
      counts.set(genreId, (counts.get(genreId) ?? 0) + 1);
    }
    if (batch.length < PAGE) break;
  }
  return counts;
}

export async function fetchMusicLibraryGenreIndex(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter,
): Promise<MusicLibraryGenreIndexEntry[]> {
  const cached = indexCache.get(catalog);
  if (cached && cached.gen === INDEX_CACHE_GEN && Date.now() - cached.at < INDEX_TTL_MS) {
    return cached.items;
  }
  await ensureWesternTreatedJpArtistCache(admin);
  const [genres, songRows] = await Promise.all([
    fetchAllCatalogGenres(admin),
    fetchAllSongRowsForArtistAggregation(admin),
  ]);
  const inCatalog = new Set(
    filterSongRowsByLibraryCatalog(songRows, catalog).map((r) => r.id).filter(Boolean),
  );
  const counts = await fetchGenreSongCounts(admin, inCatalog);
  const items: MusicLibraryGenreIndexEntry[] = [];
  for (const g of genres) {
    const slug = (g.slug ?? '').trim().toLowerCase();
    const name = usableGenreName(g.name);
    const count = counts.get(g.id) ?? 0;
    const entry = toMusicLibraryGenreIndexEntry({
      slug,
      name,
      nameJa: g.name_ja,
      count,
    });
    if (entry) items.push(entry);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  indexCache.set(catalog, { at: Date.now(), gen: INDEX_CACHE_GEN, items });
  return items;
}

export async function fetchMusicLibraryGenreLetterCounts(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter,
): Promise<Map<string, number>> {
  const items = await fetchMusicLibraryGenreIndex(admin, catalog);
  return countMusicLibraryGenresByLetter(items);
}
