/**
 * サービス一覧 — 機能カタログの正本（/services）
 * マナー・免責は /guide（ご利用上の注意）、操作の楽しみ方は /guide/enjoy を参照。
 */

import { AI_CREDITS_PRICING_PAGE_PATH } from '@/lib/ai-credits-pricing-guide';

export const SERVICE_CATALOG_PATH = '/services';
export const SERVICE_CATALOG_TITLE = 'サービス一覧';

export type ServiceCatalogPricing = 'free' | 'credits' | 'site' | 'login' | 'beta';

export const SERVICE_CATALOG_PRICING_LABELS: Record<ServiceCatalogPricing, string> = {
  free: '無料',
  credits: 'クレジット',
  site: 'サイト負担',
  login: '要登録',
  beta: 'β',
};

export type ServiceCatalogItem = {
  name: string;
  summary: string;
  pricing: ServiceCatalogPricing;
  href?: string;
  hrefLabel?: string;
};

export type ServiceCatalogSection = {
  id: string;
  title: string;
  lead: string;
  items: readonly ServiceCatalogItem[];
};

export const SERVICE_CATALOG_INTRO = {
  title: SERVICE_CATALOG_TITLE,
  lead:
    '洋楽AIチャットで使える機能を一覧にまとめています。ゲスト／無料登録（お試し）／クレジット購入の3区分で何が使えるかも確認できます。使い方のコツは「楽しみ方」、マナー・注意事項は「ご利用上の注意」をご覧ください。',
} as const;

export const SERVICE_CATALOG_SUMMARY = [
  {
    pricing: 'free' as const,
    title: '無料',
    description: '同時視聴・チャット・部屋の視聴履歴など。AI を使わない範囲はずっと無料です。',
  },
  {
    pricing: 'credits' as const,
    title: 'クレジット',
    description: 'AI付き選曲・@ 質問。お試し枠のあとは前払いクレジットを消費します。',
  },
  {
    pricing: 'site' as const,
    title: 'サイト負担',
    description: 'AIエージェントの選曲参加など。参加者のクレジットは減りません。',
  },
] as const;

export const SERVICE_CATALOG_SECTIONS: readonly ServiceCatalogSection[] = [
  {
    id: 'music-chat',
    title: '音楽チャット（無料）',
    lead: '洋楽をみんなで聴きながら会話する、本サービスの中心機能です。',
    items: [
      {
        name: 'YouTube 同時視聴',
        summary: '部屋の参加者全員で、同じタイミングに動画を再生します。',
        pricing: 'free',
      },
      {
        name: 'チャット',
        summary: '選曲や感想をリアルタイムでやり取り。@ なしの通常発言は無料です。',
        pricing: 'free',
      },
      {
        name: '選曲・再生（AI なし）',
        summary: 'YouTube URL やライブラリから曲を流すだけの選曲。曲解説は付きません。',
        pricing: 'free',
        href: '/guide/first-song',
        hrefLabel: '選曲のしかた',
      },
      {
        name: '部屋への参加',
        summary: 'ゲスト名で入室できます。登録するとマイページなどの機能が増えます。',
        pricing: 'free',
      },
    ],
  },
  {
    id: 'room-history',
    title: '部屋の視聴履歴（無料）',
    lead: '部屋内で流れた曲の共有リストです。マイページの「曲管理」とは別の、部屋単位の履歴です。',
    items: [
      {
        name: '視聴履歴一覧',
        summary:
          '誰がいつ選曲したか、アーティスト・曲名・年代・スタイルを表形式で表示。PC ではプレイヤー横、スマホではモーダルでも開けます。',
        pricing: 'free',
      },
      {
        name: 'お気に入り（ハート）',
        summary: '履歴の各行からハートを付けてお気に入りに登録。マイページの曲管理タブと連携します（要登録）。',
        pricing: 'free',
      },
      {
        name: '年代・スタイルの内訳',
        summary: 'その部屋で流れた曲を集計し、年代分布・スタイル分布をモーダルで確認できます。',
        pricing: 'free',
      },
      {
        name: '履歴からの再選曲',
        summary: '視聴履歴やライブラリ検索から、同じ曲をもう一度部屋に流せます。',
        pricing: 'free',
      },
    ],
  },
  {
    id: 'mypage-overview',
    title: 'マイページ（要登録）',
    lead: '部屋画面のヘッダーなどから開く個人設定・履歴の中心です。ゲストは一部のみ利用できます。',
    items: [
      {
        name: 'マイページ',
        summary: 'ユーザー設定・曲管理・マイリスト・参加履歴などをタブで切り替えて利用します。',
        pricing: 'login',
      },
      {
        name: '会の主催',
        summary: 'ログイン後、同時に最大 2 部屋まで開催。部屋の名前・PR 文の編集も可能です。',
        pricing: 'login',
        href: '/guide/service',
        hrefLabel: 'サービス全般',
      },
      {
        name: 'ユーザー設定',
        summary:
          '表示名・発言色・自分のステータス（離席など）・選曲参加 ON/OFF・公開プロフィール・AI お試し枠・クレジット残数・自分の AI 設定（選曲時の opt-out）など。',
        pricing: 'login',
      },
      {
        name: '部屋設定（オーナー）',
        summary:
          '主催者・チャットオーナー向け。AI エージェント、曲解説の種類、曲クイズ、おすすめ曲、選曲モード、オーナー譲渡など部屋全体の上限設定。',
        pricing: 'login',
      },
      {
        name: '参加履歴',
        summary: 'ログイン状態で入室した会の記録。入室・退出時刻と、AI 利用量の目安（参考値）を確認できます。',
        pricing: 'login',
      },
      {
        name: '質問履歴',
        summary: '部屋で送った @ 質問と AI の回答を、新しい順に一覧表示します。',
        pricing: 'login',
      },
    ],
  },
  {
    id: 'mypage-music',
    title: 'マイページ — 曲管理',
    lead: 'マイページの「曲管理」タブ。自分が部屋で貼った曲と、お気に入りを管理します。',
    items: [
      {
        name: '選曲リスト（貼った曲）',
        summary:
          'ログイン中に部屋で YouTube URL を貼って選曲した曲の個人履歴。日付ごとに表示し、プレビュー・部屋への再選曲・マイリスト追加ができます。',
        pricing: 'login',
      },
      {
        name: 'お気に入りリスト',
        summary:
          '視聴履歴でハートを付けた曲をマイページ上で一覧。解除やマイリストへの追加、TEXT ファイルでの保存ができます。',
        pricing: 'login',
      },
      {
        name: 'TEXT 保存',
        summary: '選曲リストまたはお気に入りを、UTF-8 テキストファイルとしてダウンロードします。',
        pricing: 'login',
      },
    ],
  },
  {
    id: 'mypage-mylist',
    title: 'マイページ — マイリスト',
    lead: 'チャットに依存しない自分用の曲ライブラリです。',
    items: [
      {
        name: 'マイリスト（曲の追加・編集）',
        summary:
          'YouTube URL を直接追加して自分用リストを作成。アーティスト名・曲名の編集、部屋への選曲、削除ができます（同一 video_id は 1 件まで）。',
        pricing: 'login',
      },
      {
        name: '保存済みアーティスト',
        summary: 'マイリストに登録した曲からアーティスト名を集約。頭文字（A–Z）で絞り込んで閲覧できます。',
        pricing: 'login',
      },
      {
        name: 'ライブラリ検索（部屋）',
        summary: '部屋内で、登録済み曲・アーティスト DB から選曲候補を検索して流せます。',
        pricing: 'login',
      },
      {
        name: 'お題プレイリスト（β）',
        summary: 'お題に沿って曲を集めるミッション。進行状況の確認・エントリー管理ができます。',
        pricing: 'beta',
      },
    ],
  },
  {
    id: 'mypage-ai-taste',
    title: 'マイページ — AI パーソナライズ（要登録）',
    lead: '@ 質問などで参照される趣味・嗜好のメモです。',
    items: [
      {
        name: '手動の趣味メモ',
        summary: '自分で書いた AI 向けの嗜好メモを保存し、@ 応答の文脈に使えます。',
        pricing: 'login',
      },
      {
        name: '利用履歴からの自動要約',
        summary:
          '選曲履歴・お気に入り・マイリスト・チャット（DB 保存分）・公開プロフィールなどから、Gemini が短い自動プロフィールを生成します。',
        pricing: 'login',
      },
    ],
  },
  {
    id: 'ai-credits',
    title: 'AI 機能（クレジット・お試し枠）',
    lead: '登録ユーザーには無料お試し枠があります。枯渇後は前払いクレジットを消費します。',
    items: [
      {
        name: 'AI付き選曲',
        summary: '曲解説・曲クイズ・おススメ曲の提案（最大３曲）が付きます。',
        pricing: 'credits',
        href: AI_CREDITS_PRICING_PAGE_PATH,
        hrefLabel: 'AI利用料金',
      },
      {
        name: '@ AI質問',
        summary: '発言の先頭に @ を付けて、洋楽関連の質問に AI が回答します。',
        pricing: 'credits',
        href: '/guide/ai',
        hrefLabel: 'AI について',
      },
      {
        name: '曲概要を聞く',
        summary: '再生中の曲について、AI に概要を質問します（@ 1 回分）。',
        pricing: 'credits',
      },
    ],
  },
  {
    id: 'ai-site',
    title: 'AI 機能（サイト負担）',
    lead: '参加者のクレジット・お試し枠は消費しません。API 原価はサイト運営側が負担します。',
    items: [
      {
        name: 'AIエージェントによる選曲参加',
        summary: '部屋オーナーが設定した AI がターンで曲を選び、会に参加します。',
        pricing: 'site',
      },
    ],
  },
  {
    id: 'optional',
    title: 'その他・試験中（部屋）',
    lead: '部屋設定や運用状況により利用できない場合があります。',
    items: [
      {
        name: 'おすすめ曲（部屋設定）',
        summary: '主催者が ON にした部屋で、関連曲の提案が表示されることがあります。',
        pricing: 'beta',
      },
    ],
  },
] as const;

export const SERVICE_CATALOG_RELATED_LINKS = [
  { href: '/sitemap', label: 'サイトマップ' },
  { href: '/guide/enjoy', label: '楽しみ方（操作・はじめ方）' },
  { href: '/guide', label: 'ご利用上の注意（マナー・免責）' },
  { href: AI_CREDITS_PRICING_PAGE_PATH, label: 'AI利用料金・クレジット' },
  { href: '/terms', label: '利用規約' },
] as const;
