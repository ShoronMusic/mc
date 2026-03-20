/**
 * 視聴履歴のスタイル変更を「管理者のみ」に制限する場合のユーザーID一覧。
 * Supabase Authentication → Users で表示される UUID をカンマ区切りで指定。
 * 未設定または空のときは誰でも変更可能（従来どおり）。
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
