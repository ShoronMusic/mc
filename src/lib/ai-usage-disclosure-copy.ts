/**
 * AI 利用・課金に関する参加者向け文言（単一ソース）
 * docs/room-gathering-history-and-ai-billing-project.md
 * 請求単価の正本: docs/00-prepaid-pricing-summary.md · src/lib/ai-credits-pricing-guide.ts
 */

import { AI_TRIAL_AT_QUESTIONS_GRANTED, AI_TRIAL_SONGS_GRANTED } from '@/lib/ai-trial-status';

export const AI_USAGE_DISCLOSURE_TITLE = 'AI 機能と利用料について';

/** 部屋画面：最初に見せる現状（無料） */
export const AI_USAGE_DISCLOSURE_CURRENT_FREE =
  '【現在】AI 機能（曲解説・@ 返答・豆知識・AI エージェント等）は、サイト管理者が負担して提供しています。参加者・主催者ともに追加料金はかかりません（完全無料です）。';

/** 部屋画面の短い注意（折りたたみ内の詳細の前・2段落目） */
export const AI_USAGE_DISCLOSURE_ROOM_SUMMARY =
  '将来の有料化ではクレジット消費（選曲1・@0.5）を予定しています。詳細は下の「有料化時の利用単位」をご覧ください。';

/** 登録ユーザー向け: お試し枠の説明（ステータス行の補足） */
export const AI_TRIAL_STATUS_GUEST_HINT = `ゲストは AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲の対象外です。登録（無料）すると AI 付き選曲を ${AI_TRIAL_SONGS_GRANTED} 曲までお試しいただけます。`;

/** ゲストが @ 質問したときのシステムメッセージ */
export const GUEST_AI_AT_QUESTION_UNAVAILABLE = `ゲストは @ による AI 質問は利用できません。無料登録後、お試し @ ${AI_TRIAL_AT_QUESTIONS_GRANTED} 回までご利用いただけます。`;

/** マイページ参加履歴: お試し枠見出し */
export const AI_TRIAL_STATUS_MYPAGE_HEADING = 'AI お試し枠（登録ユーザー）';

/** 3分類の比較説明（解説 / @ 質問 / その他） */
export const AI_USAGE_CATEGORY_COMPARISON_INTRO =
  'AI 機能ごとに利用の重さが異なります。一般に「@ で会話を続ける」ほど回数・入力トークンが増えやすくなります。参加者への請求イメージはクレジット（選曲1・@0.5）です。';

/** 部屋画面・詳細内の3分類ガイド */
export const AI_USAGE_CATEGORY_GUIDE_LINES = [
  '【請求イメージ】AI付き選曲 1曲＝1クレジット（約 ¥25）· @ 1回＝0.5クレジット（約 ¥12.5）。',
  '【その他】お題講評・マイページ趣向要約など。',
  '部屋共通（豆知識・AI エージェントの選曲 API）は個人の内訳に含まれません。',
] as const;

/** 部屋画面の詳細（折りたたみ） */
export const AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES = [
  '【現在の料金】サイト管理者負担のため、あなたに請求されることはありません。',
  '【ログインユーザー】選曲 AI・「@」返答は、将来の課金設計に備えてあなたの利用として記録されます（マイページの参加履歴で回数を確認できます）。',
  '【ゲスト】選曲・同時視聴・通常チャットは無料で利用できます。AI 付き選曲・@ 質問は対象外です（無料登録後、お試し枠で利用できます）。',
  '【主催者】豆知識・AI エージェントの AI も、現時点ではサイト管理者負担です。記録上は主催者の部屋枠として集計されます。',
  ...AI_USAGE_CATEGORY_GUIDE_LINES,
] as const;

/** マイページ・参加履歴タブ用の1行補足 */
export const AI_USAGE_DISCLOSURE_MYPAGE_PARTICIPATION =
  '【現在無料】表示は利用回数・トークン量の参考です。将来の請求単価はクレジットです。操作分と部屋共通（豆知識・AI エージェント等）を分けて表示します。';

/** マイページ: 部屋共通ブロック見出し */
export const AI_USAGE_DISCLOSURE_MYPAGE_ROOM_COMMON =
  '部屋共通（主催者として・参考）— 豆知識・AI エージェントなど、部屋全体に付く分です。';
