import { isDeveloperAiUnlimitedUserId } from '@/lib/ai-developer-unlimited-user-ids';
import { isSupporterAiUnlimitedUserId } from '@/lib/ai-supporter-unlimited-user-ids';

export type AiUnlimitedRole = 'developer' | 'supporter';

/** 開発者をサポーターより優先（両方に載っている場合） */
export function resolveAiUnlimitedRole(userId: string | null | undefined): AiUnlimitedRole | null {
  if (!userId) return null;
  if (isDeveloperAiUnlimitedUserId(userId)) return 'developer';
  if (isSupporterAiUnlimitedUserId(userId)) return 'supporter';
  return null;
}

export function isAiUnlimitedUserId(userId: string | null | undefined): boolean {
  return resolveAiUnlimitedRole(userId) !== null;
}
