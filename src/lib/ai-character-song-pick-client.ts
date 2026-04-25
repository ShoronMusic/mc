/** 同一 pick ログ行に載せるチャット行を順に結合し、都度サーバへ送る。 */
export function pushAiCharacterPickUtteranceLine(
  linesByLogIdRef: { current: Map<string, string[]> },
  pickLogId: string,
  line: string,
): string {
  const id = pickLogId.trim();
  const t = line.trim();
  if (!id || !t) return '';
  const prev = linesByLogIdRef.current.get(id) ?? [];
  const next = [...prev, t];
  linesByLogIdRef.current.set(id, next);
  return next.join('\n\n');
}

/**
 * AIキャラ選曲ログの「選曲後チャット文」を、INSERT 後に非同期で追記する。
 */
export function postAiCharacterPickUtteranceToLog(params: {
  pickLogId?: string | null;
  utterance: string;
  pickedVideoId: string;
  isGuest?: boolean;
}): void {
  const id = typeof params.pickLogId === 'string' ? params.pickLogId.trim() : '';
  const vid = typeof params.pickedVideoId === 'string' ? params.pickedVideoId.trim() : '';
  const text = typeof params.utterance === 'string' ? params.utterance.trim() : '';
  if (!id || !vid || !text) return;
  void fetch('/api/ai/character-song-pick-utterance', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pickLogId: id,
      utterance: text.slice(0, 2000),
      pickedVideoId: vid,
      isGuest: params.isGuest === true,
    }),
  }).catch(() => {});
}
