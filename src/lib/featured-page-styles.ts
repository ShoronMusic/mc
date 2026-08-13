/**
 * 特集ページ用スタイル（Music8 系 9 種）。
 * 曲マスタの SONG_STYLE_OPTIONS（Jazz 等）とは別定数。
 */

export const FEATURED_PAGE_STYLE_OPTIONS = [
  'Pop',
  'Dance',
  'Alternative',
  'Electronica',
  'R&B',
  'Hip-hop',
  'Rock',
  'Metal',
  'Other',
] as const;

export type FeaturedPageStyle = (typeof FEATURED_PAGE_STYLE_OPTIONS)[number];

const STYLE_SET = new Set<string>(FEATURED_PAGE_STYLE_OPTIONS);

export function isFeaturedPageStyle(raw: unknown): raw is FeaturedPageStyle {
  return typeof raw === 'string' && STYLE_SET.has(raw);
}

export function parseFeaturedPageStyle(raw: unknown): FeaturedPageStyle | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (STYLE_SET.has(t)) return t as FeaturedPageStyle;
  const lower = t.toLowerCase();
  if (lower === 'others' || lower === 'other') return 'Other';
  if (lower === 'alternative rock' || lower === 'alt') return 'Alternative';
  if (lower === 'hip-hop' || lower === 'hip hop' || lower === 'hiphop') return 'Hip-hop';
  if (lower === 'r&b' || lower === 'rnb' || lower === 'r and b') return 'R&B';
  for (const s of FEATURED_PAGE_STYLE_OPTIONS) {
    if (s.toLowerCase() === lower) return s;
  }
  return null;
}

/** モーダル表示用の並び（空セクションは呼び出し側で省略可） */
export function groupFeaturedArtistsByStyle<T extends { style: string; sort_order?: number }>(
  artists: T[],
): Array<{ style: FeaturedPageStyle; artists: T[] }> {
  const buckets = new Map<FeaturedPageStyle, T[]>();
  for (const s of FEATURED_PAGE_STYLE_OPTIONS) buckets.set(s, []);
  for (const a of artists) {
    const style = parseFeaturedPageStyle(a.style) ?? 'Other';
    buckets.get(style)!.push(a);
  }
  for (const list of buckets.values()) {
    list.sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
  }
  return FEATURED_PAGE_STYLE_OPTIONS.map((style) => ({
    style,
    artists: buckets.get(style) ?? [],
  })).filter((g) => g.artists.length > 0);
}
