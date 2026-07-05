import { getSafeInternalReturnPath } from '@/lib/safe-return-path';
import { LIVE_ROOMS_PREVIEW_PATH } from '@/lib/site-map';

/**
 * 利用規約／プライバシー／ガイドを iframe（?modal=1）で開いているとき、
 * ページ内リンクでヘッダーやトップへ飛ばさず同じ iframe 内で遷移させる。
 */
export function withPolicyModalQuery(href: string, modal: boolean): string {
  if (!modal || !href.startsWith('/') || href.startsWith('//')) return href;
  return href.includes('?') ? `${href}&modal=1` : `${href}?modal=1`;
}

/** iframe モーダル内に載せると二重 UI になるパス（親ウィンドウで開く） */
export function shouldBreakOutOfPolicyModalIframe(href: string): boolean {
  const pathOnly = href.split(/[?#]/, 1)[0] ?? '';
  if (pathOnly === '/consent') return true;
  return getSafeInternalReturnPath(pathOnly) != null;
}

export type PolicyModalLinkProps = {
  href: string;
  target?: '_parent';
};

/** サイトマップ等: モーダル内は案内ページだけ iframe 継続、トップ・部屋直リンクは親へ */
export function policyModalLinkProps(href: string, modal: boolean): PolicyModalLinkProps {
  if (!modal) return { href };
  if (shouldBreakOutOfPolicyModalIframe(href)) {
    const pathOnly = href.split(/[?#]/, 1)[0] ?? href;
    const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
    return { href: `${pathOnly}${hash}`, target: '_parent' };
  }
  return { href: withPolicyModalQuery(href, true) };
}

/** サイトマップ: モーダル内の「トップ（ルーム一覧）」→ 開催中一覧プレビュー */
export function sitemapItemLinkProps(href: string, modal: boolean): PolicyModalLinkProps {
  if (modal && href === '/') {
    return { href: withPolicyModalQuery(LIVE_ROOMS_PREVIEW_PATH, true) };
  }
  return policyModalLinkProps(href, modal);
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
