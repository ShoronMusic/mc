/**
 * AI 質問ガードで「警告・イエローカード」は通常どおり付与しつつ、
 * 累積後の自動強制退場・入室禁止（ban 処理）だけスキップする登録ユーザーの Supabase user.id。
 * クライアントで参照する（バンドルに含まれる）。
 */
const KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS = new Set<string>([
  'd100d24d-9a70-447e-84ac-e519ada7af8c',
  '25bcbb9c-ffab-4f24-b6ca-28d85fe59111',
]);

export function isAiQuestionGuardKickExemptUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS.has(userId);
}
