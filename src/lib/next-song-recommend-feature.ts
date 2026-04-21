/**
 * 「次に聴くなら」試験機能のサーバー側マスター・β 利用者判定。
 * @see docs/next-song-recommend-beta-spec.md
 */

export function isNextSongRecommendMasterEnabled(): boolean {
  return process.env.NEXT_SONG_RECOMMEND_ENABLED?.trim() === '1';
}

/** 空なら「マスター ON 時は全ログインユーザー」。1 件以上あればリスト内のみ。 */
export function getNextSongRecommendBetaUserIds(): string[] {
  const raw = process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * API で Gemini まで進めてよいか。
 * - マスター OFF → false
 * - 未ログイン → false
 * - β UID リストが非空で、uid が含まれない → false
 */
export function isNextSongRecommendAllowedForUser(userId: string | null | undefined): boolean {
  if (!isNextSongRecommendMasterEnabled()) return false;
  if (!userId) return false;
  const beta = getNextSongRecommendBetaUserIds();
  if (beta.length === 0) return true;
  return beta.includes(userId);
}
