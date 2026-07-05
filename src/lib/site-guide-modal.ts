/**
 * 楽しみ方・サービス一覧・サイトマップ — 同一モーダルのタブ定義
 */

export type SiteGuideTab = 'enjoy' | 'services' | 'sitemap';

export const SITE_GUIDE_TABS: readonly SiteGuideTab[] = ['enjoy', 'services', 'sitemap'];

export const SITE_GUIDE_TAB_LABELS: Record<SiteGuideTab, string> = {
  enjoy: '楽しみ方',
  services: 'サービス一覧',
  sitemap: 'サイトマップ',
};

export function siteGuideIframeSrc(
  tab: SiteGuideTab,
  returnToSegment?: string | null,
): string {
  const seg = returnToSegment?.trim();
  const returnQ = seg ? `&returnTo=${encodeURIComponent(seg)}` : '';
  switch (tab) {
    case 'enjoy':
      return `/guide/enjoy?modal=1${returnQ}`;
    case 'services':
      return `/services?modal=1${returnQ}`;
    case 'sitemap':
      return `/sitemap?modal=1${returnQ}`;
    default:
      return `/guide/enjoy?modal=1${returnQ}`;
  }
}
