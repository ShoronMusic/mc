/**
 * 曲解説後クイズ: 正解・正解者の発表文と締め切りまでの待ち時間（クライアント共通）
 */

export type SongQuizResultAnswer = {
  displayName: string;
  pickedIndex: number;
};

export function getSongQuizRevealDelayMs(): number {
  const raw =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS != null
      ? String(process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS).trim()
      : '';
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 5000 ? n : 90_000;
}

export function buildSongQuizResultAnnouncement(
  correctIndex: number,
  choices: string[],
  answers: SongQuizResultAnswer[],
): string {
  const n = choices.length;
  const safeIdx =
    Number.isFinite(correctIndex) && n > 0
      ? Math.max(0, Math.min(Math.floor(correctIndex), n - 1))
      : 0;
  const label = choices[safeIdx] ?? '';
  const head = `【クイズ結果】正解は ${safeIdx + 1}番「${label}」でした。`;
  const winners = answers.filter((a) => a.pickedIndex === safeIdx);
  if (winners.length > 0) {
    const names = [
      ...new Set(
        winners.map((w) => {
          const s = (w.displayName || 'ゲスト').trim() || 'ゲスト';
          return `${s}さん`;
        }),
      ),
    ];
    return `${head}正解者: ${names.join('、')}`;
  }
  if (answers.length > 0) {
    return `${head}正解者はいませんでした（不正解のみ）`;
  }
  return `${head}正解者はいませんでした（未回答）`;
}
