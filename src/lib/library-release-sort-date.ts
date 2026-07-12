/**
 * ライブラリ新旧ソート用の日付。
 * 原盤公開日（songs.original_release_date）を優先し、無ければ YouTube 公開日。
 * YT 日を原盤日列に書き込まない前提の表示・ソート補助。
 */

export type LibraryReleaseSortDates = {
  originalReleaseDate?: string | null;
  youtubePublishedAt?: string | null;
};

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
