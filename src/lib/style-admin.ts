/**
 * 用途1: 視聴履歴のスタイル変更を「管理者のみ」に制限。
 * 用途2: /admin と /api/admin/* は admin-access.ts の厳格ルール（未設定なら誰も不可）。
 * STYLE_ADMIN_USER_IDS 未設定時は **誰も変更不可**（fail-closed。/admin と揃える）。
 * Supabase Authentication → Users の UUID をカンマ区切りで指定。
 */
export function getStyleAdminUserIds(): string[] {
  const raw = process.env.STYLE_ADMIN_USER_IDS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isStyleAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getStyleAdminUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

/**
 * 部屋チャットの開発者向けツール（表記スナップショット保存など）。
 * STYLE_ADMIN_USER_IDS が未設定のときは付与しない（/admin と同じ前提）。
 */
export function isChatStyleAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getStyleAdminUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}
