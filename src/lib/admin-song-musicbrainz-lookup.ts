/** MB 検索用に括弧サブタイトル・ライブ／公式PV表記を除いた短い曲名 */
export function simplifySongTitleForMusicBrainzLookup(title: string): string | null {
  const original = title.trim();
  if (!original) return null;

  let t = original
    .replace(/\s*[\(（][^)）]+[\)）]\s*/gu, ' ')
    .replace(/\s*[[【][^\]】]+[\]】]\s*/gu, ' ')
    .replace(
      /\b(official\s+(?:music\s+)?video|official\s+audio|lyrics?\s+video|lyric\s+video|visualizer|remaster(?:ed)?(?:\s+\d{4})?|hd|4k|mv)\b/gi,
      ' ',
    )
    .replace(/\b(live(?:\s+(?:at|from|in|version|ver\.?|録音))?|ライヴ|ライブ(?:版|バージョン)?)\b/gi, ' ')
    .replace(/\s*[-–—:|]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t || t.toLowerCase() === original.toLowerCase()) return null;
  return t;
}

/** タイトルがライブ／カバー等の別バージョンっぽいか（原盤日優先判定用） */
export function songTitleLooksNonStudioVariant(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return /\b(live|ライヴ|ライブ|bootleg|demo|karaoke|instrumental|remix|cover|acoustic\s+version|unplugged)\b/i.test(
    t,
  );
}
