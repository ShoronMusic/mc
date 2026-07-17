/**
 * AI 利用・課金に関する参加者向け文言（単一ソース）
 * docs/room-gathering-history-and-ai-billing-project.md
 * 請求単価の正本: docs/00-prepaid-pricing-summary.md · src/lib/ai-credits-pricing-guide.ts
 */

export const AI_USAGE_DISCLOSURE_TITLE = 'AI 機能と利用料について';

/** 部屋画面：最初に見せる現状（無料） */
export const AI_USAGE_DISCLOSURE_CURRENT_FREE =
  '【現在】AI 機能（曲解説・@ 返答・豆知識・AI エージェント等）は、サイト管理者が API 原価を負担して提供しています。参加者・主催者・ゲストともに追加料金はかかりません（完全無料です）。';

/** 部屋画面の短い注意（折りたたみ内の詳細の前・2段落目） */
export const AI_USAGE_DISCLOSURE_ROOM_SUMMARY =
  '将来の有料化ではクレジット消費（選曲1・@0.5）を予定しています。下に出る「約 ¥1.4」などは運営のクラウド原価目安であり、あなたへの請求単価ではありません。';

/** 登録ユーザー向け: お試し枠の説明（ステータス行の補足） */
export const AI_TRIAL_STATUS_GUEST_HINT =
  'ゲストは AI お試し 10 曲の対象外です。登録（無料）すると AI 付き選曲を 10 曲までお試しいただけます。';

/** ゲストが @ 質問したときのシステムメッセージ */
export const GUEST_AI_AT_QUESTION_UNAVAILABLE =
  'ゲストは @ による AI 質問は利用できません。無料登録後、お試し @ 5 回までご利用いただけます。';

/** マイページ参加履歴: お試し枠見出し */
export const AI_TRIAL_STATUS_MYPAGE_HEADING = 'AI お試し枠（登録ユーザー）';

/** 3分類の比較説明（解説 / @ 質問 / その他） */
export const AI_USAGE_CATEGORY_COMPARISON_INTRO =
  'AI 機能ごとに運営側の原価目安が異なります。一般に「@ で会話を続ける」ほど回数・入力トークンが増えやすくなります。参加者への請求イメージはクレジット（選曲1・@0.5）です。';

/** 部屋画面・詳細内の3分類ガイド */
export const AI_USAGE_CATEGORY_GUIDE_LINES = [
  '【請求イメージ】AI付き選曲 1曲＝1クレジット（約 ¥25）· @ 1回＝0.5クレジット（約 ¥12.5）。',
  '【運営原価の目安】選曲フル1曲は通常 約 ¥1.4・多いとき 約 ¥3.6。@ 1回は約 ¥0.4〜0.5。これは運営負担の試算で、請求額ではありません。',
  '【その他】お題講評・マイページ趣向要約など。',
  '部屋共通（豆知識・AI エージェントの選曲 API）は個人の内訳に含まれません。',
] as const;

/** 部屋画面の詳細（折りたたみ） */
export const AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES = [
  '【現在の料金】サイト管理者負担のため、あなたに請求されることはありません。',
  '【ログインユーザー】選曲 AI・「@」返答は、将来の課金設計に備えてあなたの利用として記録されます（マイページの参加履歴で目安を確認できます）。',
  '【ゲスト】AI 付き選曲・@ も無料で利用できます。記録上は主催者の部屋枠として集計されます。個人の利用履歴はありません。ログインすると自分の利用目安を確認しやすくなります。',
  '【主催者】豆知識・AI エージェント・ゲスト分の AI も、現時点ではサイト管理者負担です。記録上は主催者の部屋原価として集計されます。',
  'マイページ等の円表示のうち「運営原価」はクラウド試算です。請求はチャージパック（クレジット）です。',
  ...AI_USAGE_CATEGORY_GUIDE_LINES,
] as const;

/** マイページ・参加履歴タブ用の1行補足 */
export const AI_USAGE_DISCLOSURE_MYPAGE_PARTICIPATION =
  '【現在無料】表示の円は billing_user_id（請求先）に基づく運営原価の参考値です。あなたの請求単価（クレジット）ではありません。操作分と部屋共通（豆知識・ゲスト分・AI エージェント等）を分けて表示します。';

/** マイページ: 部屋共通ブロック見出し */
export const AI_USAGE_DISCLOSURE_MYPAGE_ROOM_COMMON =
  '部屋共通（主催者として・参考）— 豆知識・ゲストの AI・AI エージェントなど、部屋全体に付く分です。';
