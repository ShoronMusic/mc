/** ご利用上の注意（ガイド）のページ一覧 */
export const GUIDE_SECTIONS = [
  {
    href: '/guide',
    slug: '',
    title: '目次',
    short: '各ページへの案内',
  },
  {
    href: '/guide/enjoy',
    slug: 'enjoy',
    title: '楽しみ方',
    short: '基本機能・ライブラリ・AIなどの一覧',
  },
  {
    href: '/guide/chat',
    slug: 'chat',
    title: 'チャットのマナー',
    short: '参加時の基本的な心得',
  },
  {
    href: '/guide/ai',
    slug: 'ai',
    title: 'AI について',
    short: 'AI 参加時の注意',
  },
  {
    href: '/guide/ai-pricing',
    slug: 'ai-pricing',
    title: 'AI利用料金・クレジット',
    short: '曲解説・@質問等のクレジット消費・購入',
  },
  {
    href: '/guide/faq',
    slug: 'faq',
    title: 'よくある質問',
    short: '無料と有料・YouTube・運営・洋楽テーマなど',
  },
  {
    href: '/guide/about',
    slug: 'about',
    title: 'このサービスについて',
    short: 'なぜ洋楽か・運営の思い・これから',
  },
  {
    href: '/guide/first-song',
    slug: 'first-song',
    title: '選曲のしかた',
    short: 'YouTube URL・検索',
  },
  {
    href: '/guide/first-song-mobile',
    slug: 'first-song-mobile',
    title: '選曲のしかた（スマホ）',
    short: '共有→コピー→送信',
  },
  {
    href: '/guide/music',
    slug: 'music',
    title: '曲・コメント',
    short: '楽曲に関する発言の注意',
  },
  {
    href: '/guide/safety',
    slug: 'safety',
    title: 'アカウントと安全',
    short: '個人情報・主催の目安・入室方法など',
  },
  {
    href: '/guide/service',
    slug: 'service',
    title: 'サービス全般',
    short: '免責・変更・お問い合わせ（料金は AI利用料金ページ）',
  },
  {
    href: '/terms',
    slug: 'terms',
    title: '利用規約',
    short: '利用条件（要約・別ページ）',
  },
] as const;

export type GuideSlug = (typeof GUIDE_SECTIONS)[number]['slug'];
