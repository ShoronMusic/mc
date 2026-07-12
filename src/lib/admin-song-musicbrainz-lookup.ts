/** MB 検索用に括弧サブタイトルを除いた短い曲名 */
export function simplifySongTitleForMusicBrainzLookup(title: string): string | null {
  const simplified = title
    .replace(/\s*[\(（][^)）]+[\)）]\s*/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!simplified || simplified === title.trim()) return null;
  return simplified;
}
