/**
 * 曲スタイルの選択肢（UI・API 共通）
 * （）内のジャンルは今後増やす想定
 */
export const SONG_STYLE_OPTIONS = [
  'Pop',
  'Dance',
  'Electronica',
  'R&B',
  'Hip-hop',
  'Alternative rock',
  'Metal',
  'Rock',
  'Jazz',
  'Other',
] as const;

export type SongStyleOption = (typeof SONG_STYLE_OPTIONS)[number];
