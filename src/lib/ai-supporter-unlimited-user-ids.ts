/**
 * サポーター向け: AI お試し枠・@ 質問枠・レート制限・質問ガード等を適用しない Supabase user.id。
 * `.env.local` / Vercel の `AI_SUPPORTER_UNLIMITED_USER_IDS`（カンマ区切り UUID）で指定。
 * クライアント側は `GET /api/user/ai-trial` の `phase: supporter_unlimited` を参照すること。
 */
export function getSupporterAiUnlimitedUserIds(): string[] {
  const raw = process.env.AI_SUPPORTER_UNLIMITED_USER_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isSupporterAiUnlimitedUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getSupporterAiUnlimitedUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}
