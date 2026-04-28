/**
 * 管理画面ライブラリ：アーティスト索引文字・ソート用（The / A / An を先頭から外す）
 */

const LEADING_ARTICLE = /^(the|a|an)\s+/i;

export function stripLeadingArticleForSort(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '';
  return t.replace(LEADING_ARTICLE, '').trim() || t;
}

/** 一覧の見出し用。先頭の英数字が無ければ "#" */
export function indexLetterForArtist(mainArtist: string): string {
  const s = stripLeadingArticleForSort(mainArtist);
  const m = s.match(/[A-Za-z0-9]/);
  if (m) return m[0].toUpperCase();
  const first = [...s][0];
  if (first && /\S/u.test(first)) return '#';
  return '#';
}

export function compareDisplayTitleCaseInsensitive(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), 'en', { sensitivity: 'base' });
}
