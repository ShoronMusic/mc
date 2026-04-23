/**
 * @ 質問ガードからの強制退場（ban）をクライアントでスキップする登録ユーザーの Supabase user.id。
 * 現状のガードは退場しないが、ペイロード action === 'ban' の互換・将来用に参照が残る。
 */
const KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS = new Set<string>([
  'd100d24d-9a70-447e-84ac-e519ada7af8c',
  '25bcbb9c-ffab-4f24-b6ca-28d85fe59111',
  'fd1a1f1a-3d12-4b42-8e35-666b95d4c106',
]);

export function isAiQuestionGuardKickExemptUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS.has(userId);
}
