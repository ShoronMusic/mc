/**
 * 用途1: 視聴履歴のスタイル変更を「管理者のみ」に制限（未設定なら誰でも変更可）。
 * 用途2: /admin と /api/admin/* は isStyleAdminUserId ではなく admin-access.ts の厳格ルール（未設定なら誰も不可）。
 * Supabase Authentication → Users の UUID をカンマ区切りで指定。
 */
export function getStyleAdminUserIds(): string[] {
  const raw = process.env.STYLE_ADMIN_USER_IDS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isStyleAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getStyleAdminUserIds();
  if (ids.length === 0) return true;
  return ids.includes(userId);
}
