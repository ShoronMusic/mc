import type { AiTrialStatus } from '@/lib/ai-trial-status';
import { isAiDeveloperUnlimitedTrialStatus } from '@/lib/ai-trial-status';

/**
 * @ 質問ガードからの強制退場（ban）をクライアントでスキップする登録ユーザーの Supabase user.id。
 * 現状のガードは退場しないが、ペイロード action === 'ban' の互換・将来用に参照が残る。
 */
const KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS = new Set<string>([
  'fd1a1f1a-3d12-4b42-8e35-666b95d4c106',
]);

export function isAiQuestionGuardKickExemptUserId(
  userId: string | null | undefined,
  aiTrialStatus?: AiTrialStatus | null,
): boolean {
  if (!userId) return false;
  if (isAiDeveloperUnlimitedTrialStatus(aiTrialStatus)) return true;
  return KICK_EXEMPT_AI_QUESTION_GUARD_USER_IDS.has(userId);
}
