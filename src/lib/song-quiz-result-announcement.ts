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
  /** 未設定時は短め（長すぎると再生が次曲に進み、発表タイマーが videoId 不一致で落ちやすい） */
  return Number.isFinite(n) && n >= 5000 ? n : 18_000;
}

function parseEnvBoundedMs(
  envKey: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw =
    typeof process !== 'undefined' && process.env[envKey] != null
      ? String(process.env[envKey]).trim()
      : '';
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.min(n, max);
}

/** 複数人在室で未回答者がいるとき、最初の締め切り後にさらにこの時間待って再チェック（ms） */
export function getSongQuizRevealExtendMs(): number {
  return parseEnvBoundedMs('NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS', 12_000, 4_000, 120_000);
}

/** クイズ表示から最長これだけ待って必ず全員向け発表（未回答は未回答のまま）（ms） */
export function getSongQuizRevealMaxMs(): number {
  return parseEnvBoundedMs('NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS', 120_000, 30_000, 600_000);
}

/** 全員回答が揃ったあと、全員向け発表までの短い待ち（ms） */
export function getSongQuizRevealFastMs(): number {
  return parseEnvBoundedMs('NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS', 2_000, 500, 30_000);
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
