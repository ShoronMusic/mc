/** song_videos.variant の管理画面選択肢。追記と後からの変更で共有する。 */
export const SONG_VIDEO_VARIANT_OPTIONS = [
  'official',
  'visualizer',
  'lyric',
  '和訳',
  'live',
  'topic',
  'other',
] as const;

export type SongVideoVariant = (typeof SONG_VIDEO_VARIANT_OPTIONS)[number];

export function normalizeSongVideoVariant(raw: string | null | undefined): SongVideoVariant | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return SONG_VIDEO_VARIANT_OPTIONS.find((v) => v.toLowerCase() === t.toLowerCase()) ?? null;
}
