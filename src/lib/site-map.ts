/**
 * サイトマップ — 公開ページ・モーダル表示の索引（正本: /sitemap）
 */

import { AI_CREDITS_PRICING_PAGE_PATH } from '@/lib/ai-credits-pricing-guide';
import { GUIDE_SECTIONS } from '@/lib/guide-nav';
import { SERVICE_CATALOG_PATH } from '@/lib/service-catalog';

export const SITE_MAP_PATH = '/sitemap';
export const SITE_MAP_TITLE = 'サイトマップ';

/** モーダル内で開催中の部屋だけ閲覧する（入室リンクなし） */
export const LIVE_ROOMS_PREVIEW_PATH = '/live-rooms';

export type SiteMapLink = {
  label: string;
  href: string;
  description: string;
};

export type SiteMapSection = {
  id: string;
  title: string;
  lead?: string;
  items: readonly SiteMapLink[];
};

export const SITE_MAP_INTRO = {
  title: SITE_MAP_TITLE,
  lead:
    '洋楽AIチャットのページと、部屋・トップからモーダルで開ける案内をまとめたサイトマップです。同じ内容でも「通常ページ」と「モーダル（?modal=1）」があるものは両方を載せています。',
} as const;

const guideGuidePages: SiteMapLink[] = GUIDE_SECTIONS.filter(
  (s) => s.slug !== '' && s.slug !== 'terms' && s.slug !== 'enjoy' && s.slug !== 'ai-pricing',
).map((s) => ({
  label: s.title,
  href: s.href,
  description: s.short,
}));

export const SITE_MAP_SECTIONS: readonly SiteMapSection[] = [
  {
    id: 'start',
    title: 'はじめる',
    items: [
      {
        label: 'トップ（ルーム一覧）',
        href: '/',
        description: '開催中の部屋へ入室、または自分で会を始めます。',
      },
    ],
  },
  {
    id: 'features',
    title: '機能の案内',
    lead: '何ができるか・料金区分の一覧です。操作の流れは「楽しみ方」をご覧ください。',
    items: [
      {
        label: 'サービス一覧',
        href: SERVICE_CATALOG_PATH,
        description: '無料・クレジット・サイト負担など、機能を区分して一覧表示。',
      },
      {
        label: '楽しみ方',
        href: '/guide/enjoy',
        description: '3ステップ・選曲の基本・機能カテゴリの紹介。',
      },
    ],
  },
  {
    id: 'guide',
    title: 'ご利用上の注意（ガイド）',
    lead: 'マナー・安全・選曲のしかたなど。下記は通常のページです。',
    items: [
      {
        label: 'ご利用上の注意（目次）',
        href: '/guide',
        description: '各ガイドページへの入口。',
      },
      ...guideGuidePages,
    ],
  },
  {
    id: 'legal',
    title: '料金・規約・法務',
    items: [
      {
        label: 'AI利用料金・クレジット',
        href: AI_CREDITS_PRICING_PAGE_PATH,
        description: 'クレジット消費・お試し枠・購入価格・前払いについて。',
      },
      {
        label: '利用規約',
        href: '/terms',
        description: '利用条件の要約。',
      },
      {
        label: 'プライバシーポリシー',
        href: '/privacy',
        description: '個人情報の取扱い。',
      },
      {
        label: '特定商取引法に基づく表示',
        href: '/commercial-transactions',
        description: 'AI クレジット販売に関する表示。',
      },
    ],
  },
  {
    id: 'modal',
    title: 'モーダル表示（部屋・ログイン後トップ）',
    lead: 'SiteGuideModal（楽しみ方・サービス一覧・サイトマップ）と PolicyDocsModal（ご利用上の注意・規約）の iframe 版。本文は上記の各ページと同じです。',
    items: [
      {
        label: '楽しみ方（モーダル）',
        href: '/guide/enjoy?modal=1',
        description: '部屋ヘッダー・トップフッターから。サービス一覧・サイトマップと同一モーダルのタブ。',
      },
      {
        label: 'サービス一覧（モーダル）',
        href: '/services?modal=1',
        description: '部屋ヘッダー・トップフッターから。楽しみ方・サイトマップと同一モーダルのタブ。',
      },
      {
        label: 'サイトマップ（モーダル）',
        href: '/sitemap?modal=1',
        description: '部屋ヘッダー・トップフッターから。楽しみ方・サービス一覧と同一モーダルのタブ。',
      },
      {
        label: 'ご利用上の注意 目次（モーダル）',
        href: '/guide?modal=1',
        description: '部屋ヘッダー・トップフッターから。',
      },
      {
        label: '利用規約（モーダル）',
        href: '/terms?modal=1',
        description: 'ゲスト登録案内などの iframe からも。',
      },
      {
        label: 'プライバシー（モーダル）',
        href: '/privacy?modal=1',
        description: '規約まわりのモーダルタブから。',
      },
      {
        label: 'ガイド各ページ（モーダル例）',
        href: '/guide/ai?modal=1',
        description: 'ガイド内リンクは ?modal=1 を引き継ぎます。例: AI について。',
      },
    ],
  },
  {
    id: 'onboarding',
    title: '入室・同意',
    items: [
      {
        label: 'ご利用にあたって（同意画面）',
        href: '/consent',
        description: '初回入室前の注意事項確認と同意。GuideFullNotice を含みます。',
      },
    ],
  },
] as const;

export const SITE_MAP_RELATED_LINKS = [
  { href: SERVICE_CATALOG_PATH, label: 'サービス一覧' },
  { href: '/guide/enjoy', label: '楽しみ方' },
  { href: '/guide', label: 'ご利用上の注意' },
  { href: AI_CREDITS_PRICING_PAGE_PATH, label: 'AI利用料金' },
] as const;
