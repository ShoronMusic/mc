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
import { AI_TRIAL_AT_QUESTIONS_GRANTED, AI_TRIAL_SONGS_GRANTED } from '@/lib/ai-trial-status';

export const AI_CREDITS_PRICING_PAGE_TITLE = 'AI利用料金・クレジット';

/** 参加者向け：利用枠の3区分（比較表の列） */
export const AI_USER_AUDIENCE_COLUMNS = [
  {
    id: 'guest',
    label: 'ゲスト',
    blurb: '未登録のまま参加',
  },
  {
    id: 'trial',
    label: '無料登録（初回クレジット付き）',
    blurb: `お試し枠：AI付き選曲 ${AI_TRIAL_SONGS_GRANTED} 曲・@ ${AI_TRIAL_AT_QUESTIONS_GRANTED} 回`,
  },
  {
    id: 'credits',
    label: '無料登録（クレジット購入）',
    blurb: '購入したクレジット残高から利用',
  },
] as const;

export type AiUserAudienceId = (typeof AI_USER_AUDIENCE_COLUMNS)[number]['id'];

/** 比較表セルの値 */
export type AiAudienceCell =
  | { kind: 'yes'; note?: string }
  | { kind: 'no'; note?: string }
  | { kind: 'trial'; note?: string }
  | { kind: 'credits'; note?: string };

export type AiUserAudienceMatrixRow = {
  feature: string;
  cells: Record<AiUserAudienceId, AiAudienceCell>;
};

/**
 * ゲスト / お試し登録 / クレジット購入 — 利用できるサービスの比較（正本）
 * 「初回クレジット付き」＝登録時のお試し枠（曲・@の回数枠）
 */
export const AI_USER_AUDIENCE_MATRIX_TITLE = '利用できるサービスの一覧（3区分）';

export const AI_USER_AUDIENCE_MATRIX_INTRO =
  '参加のしかたは次の3区分です。音楽チャット（同時視聴・選曲・通常チャット）はどの区分でも無料です。クラウドAIを使う機能だけ、お試し枠または購入クレジットが必要です。';

export const AI_USER_AUDIENCE_MATRIX_ROWS: readonly AiUserAudienceMatrixRow[] = [
  {
    feature: '同時視聴・通常チャット',
    cells: {
      guest: { kind: 'yes' },
      trial: { kind: 'yes' },
      credits: { kind: 'yes' },
    },
  },
  {
    feature: 'AIなしの選曲・再生',
    cells: {
      guest: { kind: 'yes' },
      trial: { kind: 'yes' },
      credits: { kind: 'yes' },
    },
  },
  {
    feature: 'AI付き選曲（曲解説・曲クイズなど）',
    cells: {
      guest: { kind: 'no' },
      trial: { kind: 'trial', note: `残り枠内（最大 ${AI_TRIAL_SONGS_GRANTED} 曲）` },
      credits: { kind: 'credits', note: '1曲＝1クレジット' },
    },
  },
  {
    feature: '@ AI質問',
    cells: {
      guest: { kind: 'no' },
      trial: { kind: 'trial', note: `残り枠内（最大 ${AI_TRIAL_AT_QUESTIONS_GRANTED} 回）` },
      credits: { kind: 'credits', note: '1回＝0.5クレジット' },
    },
  },
  {
    feature: 'マイページ・自分の利用履歴',
    cells: {
      guest: { kind: 'no' },
      trial: { kind: 'yes' },
      credits: { kind: 'yes' },
    },
  },
  {
    feature: 'お題プレイリスト（β）',
    cells: {
      guest: { kind: 'no' },
      trial: { kind: 'yes' },
      credits: { kind: 'yes' },
    },
  },
  {
    feature: '部屋のAIエージェント参加を楽しむ',
    cells: {
      guest: { kind: 'yes', note: 'オーナー設定時。自分の枠は消費しません' },
      trial: { kind: 'yes', note: 'オーナー設定時。自分の枠は消費しません' },
      credits: { kind: 'yes', note: 'オーナー設定時。自分の枠は消費しません' },
    },
  },
] as const;

export function formatAiAudienceCell(cell: AiAudienceCell): { mark: string; note?: string } {
  switch (cell.kind) {
    case 'yes':
      return { mark: '○', note: cell.note };
    case 'no':
      return { mark: '×', note: cell.note };
    case 'trial':
      return { mark: 'お試し枠', note: cell.note };
    case 'credits':
      return { mark: '残高から', note: cell.note };
  }
}

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
    audience: '無料登録（初回クレジット付き）',
    detail: `お試し枠：AI付き選曲 ${AI_TRIAL_SONGS_GRANTED} 曲・@ ${AI_TRIAL_AT_QUESTIONS_GRANTED} 回（生涯。枯渇後も選曲・チャットは無料）`,
  },
  {
    audience: '無料登録（クレジット購入）',
    detail: '購入残高から AI 付き選曲・@ を利用（選曲1・@0.5）。枠が無くても音楽チャット自体は無料のまま',
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
  '上記は参加者への請求イメージです（現在は無料のお試し期間）。クラウド側のAPI原価はサイト運営が負担します。';

export const AI_CREDITS_PRICING_PAGE_PATH = '/guide/ai-pricing';
