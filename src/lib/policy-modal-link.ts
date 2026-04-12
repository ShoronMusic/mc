import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

/**
 * 利用規約／プライバシー／ガイドを iframe（?modal=1）で開いているとき、
 * ページ内リンクでヘッダーやトップへ飛ばさず同じ iframe 内で遷移させる。
 */
export function withPolicyModalQuery(href: string, modal: boolean): string {
  if (!modal || !href.startsWith('/') || href.startsWith('//')) return href;
  return href.includes('?') ? `${href}&modal=1` : `${href}?modal=1`;
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** ガイド各ページ間のリンク用。`modal=1` と安全な `returnTo` を引き継ぐ */
export function guideInternalHref(
  path: string,
  searchParams: { modal?: string | string[]; returnTo?: string | string[] } | undefined,
): string {
  const modal = firstSearchParam(searchParams?.modal) === '1';
  let href = withPolicyModalQuery(path, modal);
  const rawReturn = firstSearchParam(searchParams?.returnTo);
  const safe = getSafeInternalReturnPath(rawReturn);
  if (!safe) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}returnTo=${encodeURIComponent(safe.slice(1))}`;
}
