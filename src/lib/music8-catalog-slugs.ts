/**
 * Music8 公開カタログ（style / genre / vocal / tag）の slug 正規化。
 * WP term ID は docs/sql/music8-catalog-extension.sql の seed と一致させる。
 */

export const MUSIC8_NAV_STYLE_SLUGS = [
  'pop',
  'dance',
  'alternative',
  'electronica',
  'rb',
  'hip-hop',
  'rock',
  'metal',
  'others',
] as const;

export type Music8NavStyleSlug = (typeof MUSIC8_NAV_STYLE_SLUGS)[number];

/** WP style term ID → 公開スラッグ */
export const MUSIC8_STYLE_WP_ID_TO_SLUG: Record<number, Music8NavStyleSlug> = {
  2844: 'pop',
  4686: 'dance',
  2845: 'alternative',
  2846: 'electronica',
  2847: 'rb',
  2848: 'hip-hop',
  2849: 'rock',
  6409: 'metal',
  2873: 'others',
};

const NAME_TO_SLUG: Record<string, Music8NavStyleSlug> = {
  pop: 'pop',
  dance: 'dance',
  alternative: 'alternative',
  'alternative rock': 'alternative',
  electronica: 'electronica',
  'r&b': 'rb',
  rb: 'rb',
  'hip-hop': 'hip-hop',
  'hip hop': 'hip-hop',
  rock: 'rock',
  metal: 'metal',
  others: 'others',
  other: 'others',
};

export function slugifyCatalogLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function music8NavStyleSlugFromWpId(id: number): Music8NavStyleSlug | null {
  return MUSIC8_STYLE_WP_ID_TO_SLUG[id] ?? null;
}

export function music8NavStyleSlugFromName(name: string): Music8NavStyleSlug | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return NAME_TO_SLUG[key] ?? null;
}

export function music8NavStyleSlugFromStyleIds(ids: number[]): Music8NavStyleSlug | null {
  for (const id of ids) {
    const slug = music8NavStyleSlugFromWpId(id);
    if (slug && slug !== 'others') return slug;
  }
  for (const id of ids) {
    const slug = music8NavStyleSlugFromWpId(id);
    if (slug) return slug;
  }
  return null;
}

export function youtubeVideoIdFromUnknown(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  const fromUrl = s.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return null;
}

export function asRecord(x: unknown): Record<string, unknown> | null {
  if (x != null && typeof x === 'object' && !Array.isArray(x)) return x as Record<string, unknown>;
  return null;
}

export function termSlugAndName(item: unknown): { slug: string; name: string; wpTermId: number | null } | null {
  if (typeof item === 'string') {
    const name = item.trim();
    if (!name) return null;
    return { slug: slugifyCatalogLabel(name), name, wpTermId: null };
  }
  const o = asRecord(item);
  if (!o) return null;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const slugRaw = typeof o.slug === 'string' ? o.slug.trim() : '';
  const idRaw = o.id;
  const wpTermId =
    typeof idRaw === 'number' && Number.isFinite(idRaw)
      ? idRaw
      : typeof idRaw === 'string' && Number.isFinite(Number(idRaw))
        ? Number(idRaw)
        : null;
  const slug = slugifyCatalogLabel(slugRaw || name);
  if (!slug && !name) return null;
  return { slug: slug || slugifyCatalogLabel(name), name: name || slug, wpTermId };
}
