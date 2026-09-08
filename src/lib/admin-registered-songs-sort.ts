export const ADMIN_REGISTERED_SONGS_SORTS = [
  'created_at_desc',
  'created_at_asc',
  'artist_asc',
  'artist_desc',
  'title_asc',
  'title_desc',
  'release_desc',
  'release_asc',
] as const;

export type AdminRegisteredSongsSort = (typeof ADMIN_REGISTERED_SONGS_SORTS)[number];

export type AdminRegisteredSongsScope = 'all' | 'western' | 'domestic';

export function parseAdminRegisteredSongsSort(raw: string | null | undefined): AdminRegisteredSongsSort {
  const v = (raw ?? '').trim();
  return (ADMIN_REGISTERED_SONGS_SORTS as readonly string[]).includes(v)
    ? (v as AdminRegisteredSongsSort)
    : 'created_at_desc';
}

export function parseAdminRegisteredSongsScope(raw: string | null | undefined): AdminRegisteredSongsScope {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'western' || v === 'domestic') return v;
  return 'all';
}

export function adminRegisteredSongsOrder(sort: AdminRegisteredSongsSort): {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
} {
  switch (sort) {
    case 'created_at_asc':
      return { column: 'created_at', ascending: true, nullsFirst: false };
    case 'artist_asc':
      return { column: 'main_artist', ascending: true, nullsFirst: false };
    case 'artist_desc':
      return { column: 'main_artist', ascending: false, nullsFirst: true };
    case 'title_asc':
      return { column: 'song_title', ascending: true, nullsFirst: false };
    case 'title_desc':
      return { column: 'song_title', ascending: false, nullsFirst: true };
    case 'release_desc':
      return { column: 'original_release_date', ascending: false, nullsFirst: false };
    case 'release_asc':
      return { column: 'original_release_date', ascending: true, nullsFirst: false };
    case 'created_at_desc':
    default:
      return { column: 'created_at', ascending: false, nullsFirst: false };
  }
}
