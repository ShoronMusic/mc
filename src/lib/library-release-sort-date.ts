/**
 * ライブラリ新旧ソート用の日付。
 * 原盤公開日を優先し、無ければ YouTube 公開日。
 * Music8 スナップショットにアルバム日があれば DB 列（WP/YT 混入）より優先する。
 */

import { resolveAlbumReleaseDateFromPersistedSnapshot } from '@/lib/music8-song-fields';

export type LibraryReleaseSortDates = {
  originalReleaseDate?: string | null;
  youtubePublishedAt?: string | null;
};

/**
 * 一覧表示・ソート用の原盤日。
 * Music8 の `releaseDate_normalized` があればそれを優先し、なければ DB 列。
 */
export function resolveLibraryOriginalReleaseDate(opts: {
  originalReleaseDate?: string | null;
  music8SongData?: unknown;
}): string | null {
  const fromM8 = resolveAlbumReleaseDateFromPersistedSnapshot(opts.music8SongData);
  if (fromM8) return fromM8;
  const col = (opts.originalReleaseDate ?? '').trim();
  return col || null;
}

/** YYYY-MM-DD（またはそれより長い ISO の先頭10桁）を返す。どちらも無ければ null。 */
export function libraryEffectiveReleaseDateForSort(
  dates: LibraryReleaseSortDates,
): string | null {
  const original = (dates.originalReleaseDate ?? '').trim();
  if (original) {
    const d = original.slice(0, 10);
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(d)) return d.length >= 10 ? d : `${d}-01`.slice(0, 10);
    return d;
  }
  const yt = (dates.youtubePublishedAt ?? '').trim();
  if (!yt) return null;
  const d = yt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d : null;
}

/**
 * 新旧比較。desc = 新しい順（デフォルト）、asc = 古い順。
 * 日付なしは末尾。
 */
export function compareLibraryReleaseSort(
  a: LibraryReleaseSortDates,
  b: LibraryReleaseSortDates,
  order: 'desc' | 'asc' = 'desc',
): number {
  const da = libraryEffectiveReleaseDateForSort(a);
  const db = libraryEffectiveReleaseDateForSort(b);
  if (da && db) {
    const c = da.localeCompare(db);
    if (c === 0) return 0;
    return order === 'desc' ? -c : c;
  }
  if (db && !da) return 1;
  if (da && !db) return -1;
  return 0;
}
