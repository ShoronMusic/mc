/** 曲解説後クイズ（3択）API・チャット表示で共有 */

export type SongQuizPayload = {
  question: string;
  choices: [string, string, string];
  correctIndex: 0 | 1 | 2;
  /** 正解オープン用の短文（入力曲解説の範囲内） */
  explanation: string;
};

export function isValidSongQuizPayload(x: unknown): x is SongQuizPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.question !== 'string' || !o.question.trim()) return false;
  if (!Array.isArray(o.choices) || o.choices.length !== 3) return false;
  if (!o.choices.every((c) => typeof c === 'string' && String(c).trim())) return false;
  const ci = o.correctIndex;
  if (ci !== 0 && ci !== 1 && ci !== 2) return false;
  if (typeof o.explanation !== 'string' || !String(o.explanation).trim()) return false;
  return true;
}
