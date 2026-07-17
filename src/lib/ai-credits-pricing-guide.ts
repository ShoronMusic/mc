/**
 * AI 利用料金・クレジット — 参加者向け表示の正本（書面・UI 共通）
 */

import {
  AI_CREDIT_PACK_1000_CREDITS,
  AI_CREDIT_PACK_1000_JPY,
  AI_CREDIT_PACK_500_CREDITS,
  AI_CREDIT_PACK_500_JPY,
  AI_CREDIT_COST_PER_AT_QUESTION,
  AI_CREDIT_COST_PER_SONG,
} from '@/lib/ai-credits-config';

export const AI_CREDITS_PRICING_PAGE_TITLE = 'AI利用料金・クレジット';

export const AI_CREDITS_FREE_FEATURES = [
  'YouTube 動画の同時視聴',
  '通常チャット（@ なし）',
  'AI なしの選曲・再生',
  '部屋の視聴履歴（共有）',
] as const;

export type AiCreditsBillableItem = {
  label: string;
  credits: number;
  unit: string;
  includes: readonly string[];
  note?: string;
};

/** クレジット（またはお試し枠）を消費する AI 機能 */
export const AI_CREDITS_BILLABLE_ITEMS: readonly AiCreditsBillableItem[] = [
  {
    label: 'AI付き選曲',
    credits: AI_CREDIT_COST_PER_SONG,
    unit: '1曲',
    includes: ['曲解説', '曲クイズ', 'おススメ曲の提案（最大３曲）'],
    note: '「再生のみ」で選曲した場合は無料（クレジット消費なし）',
  },
  {
    label: '@ AI質問',
    credits: AI_CREDIT_COST_PER_AT_QUESTION,
    unit: '1回',
    includes: ['チャットでの @ 質問', '曲概要を聞く'],
  },
] as const;

/** 参加者のクレジット・お試し枠を消費しない AI（サイト運営側負担） */
export const AI_CREDITS_SITE_BORNE_ITEMS = [
  {
    label: 'AIエージェントによる選曲参加',
    detail:
      '部屋オーナーが設定した AI エージェントがターンで曲を選んで参加する機能です。参加者のクレジット・お試し枠は消費しません（API 原価はサイト運営側が負担します）。',
  },
] as const;

export const AI_CREDITS_TRIAL_ROWS = [
  { audience: 'ゲスト', detail: 'AI 不可。選曲・同時視聴・通常チャットのみ無料' },
  {
    audience: '無料登録ユーザー',
    detail: '生涯目安：AI付き選曲 10 曲・@ 5 回（お試し枠。枯渇後はクレジット購入）',
  },
] as const;

export const AI_CREDITS_PACK_ROWS = [
  { yen: AI_CREDIT_PACK_500_JPY, credits: AI_CREDIT_PACK_500_CREDITS },
  { yen: AI_CREDIT_PACK_1000_JPY, credits: AI_CREDIT_PACK_1000_CREDITS },
] as const;

/** ¥1,000＝40 基準の実効単価（円／クレジット） */
export const AI_CREDIT_YEN_PER_CREDIT = AI_CREDIT_PACK_1000_JPY / AI_CREDIT_PACK_1000_CREDITS;

export function formatAiCreditEffectiveYen(credits: number): string {
  const yen = credits * AI_CREDIT_YEN_PER_CREDIT;
  return Number.isInteger(yen) ? `約 ¥${yen}` : `約 ¥${Math.round(yen * 10) / 10}`;
}

/** 部屋・説明用: 請求単価（クレジット）の要約 */
export const AI_CREDITS_BILLING_SUMMARY_TITLE = '有料化時の利用単位（予定）';

export const AI_CREDITS_BILLING_SUMMARY_LINES = [
  `AI付き選曲 1曲＝${AI_CREDIT_COST_PER_SONG}クレジット（${formatAiCreditEffectiveYen(AI_CREDIT_COST_PER_SONG)}）`,
  `@ 質問 1回＝${AI_CREDIT_COST_PER_AT_QUESTION}クレジット（${formatAiCreditEffectiveYen(AI_CREDIT_COST_PER_AT_QUESTION)}・2回で1クレジット）`,
  `チャージ例: ¥${AI_CREDIT_PACK_500_JPY}＝${AI_CREDIT_PACK_500_CREDITS}クレジット · ¥${AI_CREDIT_PACK_1000_JPY}＝${AI_CREDIT_PACK_1000_CREDITS}クレジット`,
] as const;

export const AI_CREDITS_BILLING_SUMMARY_FOOTNOTE =
  '上記が参加者への請求イメージです。下の「約 ¥1.4」などの数字は運営が払うクラウド原価の目安であり、あなたの請求額ではありません。';

export const AI_CREDITS_PRICING_PAGE_PATH = '/guide/ai-pricing';
