/**
 * アーティスト英語名の抽出・統合（邦楽登録フロー用）
 */

const JAPANESE_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

/** description_en 先頭の「Name is …」から英語名を抽出 */
export function extractEnglishArtistNameFromDescription(
  descriptionEn: string | null | undefined,
): string | null {
  const t = descriptionEn?.trim();
  if (!t) return null;
  const m = t.match(/^([A-Za-z][A-Za-z0-9\s.'-]{1,60}?)\s+is\b/i);
  return m?.[1]?.trim() ?? null;
}

/** en.wikipedia のスラッグを表示名に（例: Kenshi_Yonezu → Kenshi Yonezu） */
export function englishNameFromWikipediaSlug(slug: string | null | undefined): string | null {
  const t = (slug ?? '').trim();
  if (!t || JAPANESE_SCRIPT.test(t)) return null;
  const name = t.replace(/_/g, ' ').trim();
  return name || null;
}

/**
 * 英語名の優先順位: Spotify > description_en > en Wikipedia > 既存
 */
export function resolveArtistEnglishName(params: {
  spotifyName?: string | null;
  descriptionEn?: string | null;
  wikipediaPage?: string | null;
  wikipediaLang?: 'en' | 'ja' | null;
  existing?: string | null;
}): string | null {
  const spotify = (params.spotifyName ?? '').trim();
  if (spotify) return spotify;

  const fromDesc = extractEnglishArtistNameFromDescription(params.descriptionEn);
  if (fromDesc) return fromDesc;

  if (params.wikipediaLang === 'en') {
    const fromWiki = englishNameFromWikipediaSlug(params.wikipediaPage);
    if (fromWiki) return fromWiki;
  }

  const existing = (params.existing ?? '').trim();
  return existing || null;
}

/** Spotify 確定後は英語名を上書き、それ以外は resolve */
export function mergeArtistEnglishNameAfterSpotify(
  spotifyName: string | null | undefined,
): string | null {
  const t = (spotifyName ?? '').trim();
  return t || null;
}

/** Wikipedia 取得後: en のときのみ、英語名が未設定なら補完 */
export function mergeArtistEnglishNameAfterWikipedia(params: {
  currentNameEn: string | null | undefined;
  wikipediaPage: string | null | undefined;
  wikipediaLang: 'en' | 'ja' | null | undefined;
}): string | null {
  const current = (params.currentNameEn ?? '').trim();
  if (current) return current;
  if (params.wikipediaLang !== 'en') return null;
  return englishNameFromWikipediaSlug(params.wikipediaPage);
}
