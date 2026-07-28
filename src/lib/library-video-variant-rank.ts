/** ライブラリ代表 video の優先度（小さいほど優先）。公式 → Topic → 歌詞 → Live → その他 → 未設定 */
export function rankLibraryVideoVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}
