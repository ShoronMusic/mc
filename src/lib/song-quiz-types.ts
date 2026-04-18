/** 曲解説後クイズ（3択）API・チャット表示で共有 */

export const SONG_QUIZ_THEMES = ['sound', 'artist', 'reception', 'relations'] as const;
export type SongQuizTheme = (typeof SONG_QUIZ_THEMES)[number];

/** UI 用の短いラベル（出題観点の多様化表示） */
export const SONG_QUIZ_THEME_UI_LABEL: Record<SongQuizTheme, string> = {
  sound: 'サウンド・編曲',
  artist: 'アーティスト',
  reception: '文化・受容',
  relations: '関係性・同時代',
};

export type SongQuizPayload = {
  question: string;
  choices: [string, string, string];
  correctIndex: 0 | 1 | 2;
  /** 正解オープン用の短文（入力曲解説の範囲内） */
  explanation: string;
  /** 出題観点（モデルが選んだテーマ。未返却時は省略可） */
  theme?: SongQuizTheme;
};

export function isValidSongQuizTheme(x: unknown): x is SongQuizTheme {
  return typeof x === 'string' && (SONG_QUIZ_THEMES as readonly string[]).includes(x);
}

/** 同期メッセージ経由で数値型がずれたときの表示用 */
export function coerceSongQuizCorrectIndex(ci: unknown): 0 | 1 | 2 {
  if (ci === 0 || ci === 1 || ci === 2) return ci;
  const n = Number(ci);
  if (n === 0 || n === 1 || n === 2) return n;
  return 0;
}

export function isValidSongQuizPayload(x: unknown): x is SongQuizPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return false;
  if (!Array.isArray(o.choices) || o.choices.length !== 3) return false;
  if (!o.choices.every((c) => typeof c === 'string' && String(c).trim())) return false;
  const ci = o.correctIndex;
  if (ci !== 0 && ci !== 1 && ci !== 2) return false;
  if (typeof o.explanation !== 'string' || !String(o.explanation).trim()) return false;
  if (o.theme !== undefined && !isValidSongQuizTheme(o.theme)) return false;
  return true;
}

const SONG_QUIZ_FEEDBACK_BODY_MAX = 12000;

/** comment-feedback 等に渡す出題本文（問題・選択肢・正解・解説） */
export function formatSongQuizFeedbackBody(sq: SongQuizPayload, maxLen = SONG_QUIZ_FEEDBACK_BODY_MAX): string {
  const lines: string[] = ['[三択クイズ出題]'];
  if (sq.theme && isValidSongQuizTheme(sq.theme)) {
    lines.push(`出題の観点: ${SONG_QUIZ_THEME_UI_LABEL[sq.theme]}`);
  }
  lines.push(`問題: ${sq.question.trim()}`);
  sq.choices.forEach((c, i) => {
    lines.push(`選択肢${i + 1}: ${String(c).trim()}`);
  });
  lines.push(`正解インデックス: ${sq.correctIndex}`);
  lines.push(`解説: ${String(sq.explanation).trim()}`);
  const text = lines.join('\n');
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n…（省略）` : text;
}
