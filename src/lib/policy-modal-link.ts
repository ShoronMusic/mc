/**
 * 利用規約／プライバシー／ガイドを iframe（?modal=1）で開いているとき、
 * ページ内リンクでヘッダーやトップへ飛ばさず同じ iframe 内で遷移させる。
 */
export function withPolicyModalQuery(href: string, modal: boolean): string {
  if (!modal || !href.startsWith('/') || href.startsWith('//')) return href;
  return href.includes('?') ? `${href}&modal=1` : `${href}?modal=1`;
}
