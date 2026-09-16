import { compareDisplayTitleCaseInsensitive, stripLeadingArticleForSort } from '@/lib/admin-library-index';

export const MUSIC_LIBRARY_ARTIST_LETTER_SORTS = ['abc', 'songs', 'active'] as const;
export const MUSIC_LIBRARY_ARTIST_LETTER_DIRS = ['asc', 'desc'] as const;

export type MusicLibraryArtistLetterSort = (typeof MUSIC_LIBRARY_ARTIST_LETTER_SORTS)[number];
export type MusicLibraryArtistLetterDir = (typeof MUSIC_LIBRARY_ARTIST_LETTER_DIRS)[number];

export function parseMusicLibraryArtistLetterSort(
  raw: string | null | undefined,
): MusicLibraryArtistLetterSort {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'songs' || v === 'active') return v;
  return 'abc';
}

export function parseMusicLibraryArtistLetterDir(
  raw: string | null | undefined,
  sort: MusicLibraryArtistLetterSort,
): MusicLibraryArtistLetterDir {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'asc' || v === 'desc') return v;
  return sort === 'abc' ? 'asc' : 'desc';
}

function nameKey(name: string): string {
  return stripLeadingArticleForSort(name);
}

function compareName(a: string, b: string): number {
  return compareDisplayTitleCaseInsensitive(nameKey(a), nameKey(b));
}

type LetterSortItem = {
  name: string;
  count: number;
  activeStartYear?: number | null;
};

export function compareMusicLibraryArtistLetterItems(
  a: LetterSortItem,
  b: LetterSortItem,
  sort: MusicLibraryArtistLetterSort,
  dir: MusicLibraryArtistLetterDir,
): number {
  const sign = dir === 'desc' ? -1 : 1;
  if (sort === 'songs') {
    if (a.count !== b.count) return (a.count - b.count) * sign;
    return compareName(a.name, b.name);
  }
  if (sort === 'active') {
    const ay = a.activeStartYear ?? null;
    const by = b.activeStartYear ?? null;
    if (ay == null && by == null) return compareName(a.name, b.name);
    if (ay == null) return 1;
    if (by == null) return -1;
    if (ay !== by) return (ay - by) * sign;
    return compareName(a.name, b.name);
  }
  const byName = compareName(a.name, b.name);
  if (byName !== 0) return byName * sign;
  return b.count - a.count;
}

export function sortMusicLibraryArtistLetterItems<T extends LetterSortItem>(
  items: T[],
  sort: MusicLibraryArtistLetterSort = 'abc',
  dir: MusicLibraryArtistLetterDir = 'asc',
): T[] {
  return [...items].sort((a, b) => compareMusicLibraryArtistLetterItems(a, b, sort, dir));
}
