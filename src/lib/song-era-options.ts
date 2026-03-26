/**
 * 曲の年代（十年）の選択肢。視聴履歴・API・Gemini 出力の正規化で共通利用。
 */
export const SONG_ERA_OPTIONS = [
  'Pre-50s',
  '50s',
  '60s',
  '70s',
  '80s',
  '90s',
  '00s',
  '10s',
  '20s',
  'Other',
] as const;

export type SongEraOption = (typeof SONG_ERA_OPTIONS)[number];
