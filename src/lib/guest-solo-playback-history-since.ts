/**
 * ゲスト単独（登録ユーザー不在・人間参加者が自分だけ）か。
 * 視聴履歴のセッション限定・初回選曲後の誘いメッセージなどで共通利用。
 */
export function isGuestSoloSession(params: {
  isGuest: boolean;
  roomHasRegisteredParticipant: boolean;
  humanParticipantCount: number;
}): boolean {
  return (
    params.isGuest &&
    !params.roomHasRegisteredParticipant &&
    params.humanParticipantCount <= 1
  );
}

/**
 * ゲスト単独（登録ユーザー不在）のとき、視聴履歴を「この入室セッション以降」に限定する。
 */
export function resolveGuestSoloPlaybackHistorySinceIso(
  isGuest: boolean,
  roomHasRegisteredParticipant: boolean,
  sessionEnteredAtMs: number,
): string | undefined {
  if (!isGuest || roomHasRegisteredParticipant) return undefined;
  const ms =
    typeof sessionEnteredAtMs === 'number' && Number.isFinite(sessionEnteredAtMs) && sessionEnteredAtMs > 0
      ? sessionEnteredAtMs
      : Date.now();
  return new Date(ms).toISOString();
}
