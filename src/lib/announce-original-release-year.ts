/**
 * 選曲アナウンス用: 原盤公開年を「Artist - Song (YYYY)」形式で末尾に付ける。
 */

/** ISO / YYYY-MM-DD / YYYY から年を取る。無効なら null */
export function yearFromOriginalReleaseDate(iso: string | null | undefined): number | null {
  const s = (iso ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return y;
}

/**
 * 末尾に `(YYYY)` が無ければ付与。既に `(1979)` / `（1979）` がある場合は触らない。
 */
export function appendOriginalReleaseYearSuffix(
  title: string,
  year: number | null | undefined,
): string {
  const t = title.trim();
  if (!t || year == null || !Number.isFinite(year)) return t;
  const y = Math.floor(year);
  if (y < 1900 || y > 2100) return t;
  if (/\(\d{4}\)\s*$/u.test(t) || /（\d{4}）\s*$/u.test(t)) return t;
  if (/\(\d{4}\)\s*（邦楽）\s*$/u.test(t) || /（\d{4}）\s*（邦楽）\s*$/u.test(t)) return t;
  return `${t} (${y})`;
}
