/**
 * AI お試し監視（管理画面）から除外する user_id。
 * STYLE_ADMIN（小龍・ろん等）と AI_DEVELOPER_UNLIMITED を対象外にし、一般ユーザーの trial のみ集計する。
 */

import { getDeveloperAiUnlimitedUserIds } from '@/lib/ai-developer-unlimited-user-ids';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export function getAiTrialAdminMonitoringExcludedUserIds(): string[] {
  const set = new Set<string>();
  for (const id of getStyleAdminUserIds()) set.add(id);
  for (const id of getDeveloperAiUnlimitedUserIds()) set.add(id);
  return [...set];
}

export function isAiTrialAdminMonitoringExcludedUserId(userId: string | null | undefined): boolean {
  const uid = userId?.trim();
  if (!uid) return false;
  return getAiTrialAdminMonitoringExcludedUserIds().includes(uid);
}
