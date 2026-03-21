/**
 * song_tidbits（AIコメントライブラリ）を「NG」で無効化できるユーザーの UUID 一覧。
 * Supabase Authentication → Users の ID をカンマ区切りで指定（最高管理者・テスト運用用）。
 * 未設定または空のときは誰にも NG ボタンを出さない。
 */
export function getTidbitModeratorUserIds(): string[] {
  const raw = process.env.AI_TIDBIT_MODERATOR_USER_IDS ?? '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** ログイン email（小文字化して比較）。UUID が分かりにくいとき用。 */
export function getTidbitModeratorEmails(): string[] {
  const raw = process.env.AI_TIDBIT_MODERATOR_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isTidbitModeratorUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getTidbitModeratorUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

/** NG API・ボタン表示用。UID または許可メールのどちらかで可。 */
export function isTidbitModerator(
  user: { id: string; email?: string | null } | null | undefined,
): boolean {
  if (!user?.id) return false;
  if (isTidbitModeratorUserId(user.id)) return true;
  const allowEmails = getTidbitModeratorEmails();
  if (allowEmails.length === 0) return false;
  const em = (user.email ?? '').trim().toLowerCase();
  return Boolean(em) && allowEmails.includes(em);
}
