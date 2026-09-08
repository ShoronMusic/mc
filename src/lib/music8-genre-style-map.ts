import type { SongStyle } from '@/lib/gemini';

const STYLE_ID_TO_APP: Record<number, SongStyle> = {
  2849: 'Rock',
  2844: 'Pop',
  4686: 'Dance',
  2845: 'Alternative rock',
  2846: 'Electronica',
  2847: 'R&B',
  2848: 'Hip-hop',
  6409: 'Metal',
};

const STYLE_NAME_TO_APP: Array<{ re: RegExp; style: SongStyle }> = [
  {
    re: /\b(?:r\s*&\s*b|rnb|soul|neo[-\s]?soul|afrobeats?|quiet\s*storm|hip[-\s]?hop\s*soul|contemporary\s*r(?:\s*&\s*b|nb)|rhythm\s*and\s*blues)\b/i,
    style: 'R&B',
  },
  { re: /\b(?:hip[\s-]?hop|rap|trap)\b/i, style: 'Hip-hop' },
  { re: /\b(?:dance|disco|funk)\b/i, style: 'Dance' },
  { re: /\b(?:alternative|indie|grunge|post[-\s]?punk)\b/i, style: 'Alternative rock' },
  { re: /\b(?:metal|hard\s*rock|heavy\s*metal)\b/i, style: 'Metal' },
  { re: /\b(?:electronica|electronic|edm|house|techno|trance|drum\s*&?\s*bass|d&b|synthwave)\b/i, style: 'Electronica' },
  /** soft rock は Rock より先に Pop へ（`\brock\b` に食われないように） */
  {
    re: /\b(?:pop|adult\s*contemporary|singer[-\s]?songwriter|soft\s*rock|ballad)\b/i,
    style: 'Pop',
  },
  { re: /\b(?:rock|new wave|punk)\b/i, style: 'Rock' },
  { re: /\b(?:jazz|fusion|swing|bop)\b/i, style: 'Jazz' },
];

const DIRECT_STYLE_NAME_TO_APP: Record<string, SongStyle> = {
  'r&b': 'R&B',
  rnb: 'R&B',
  soul: 'R&B',
  'neo-soul': 'R&B',
  'neo soul': 'R&B',
  'contemporary r&b': 'R&B',
  'hip hop soul': 'R&B',
  'hip-hop soul': 'R&B',
  'quiet storm': 'R&B',
  'hip-hop': 'Hip-hop',
  dance: 'Dance',
  'alternative rock': 'Alternative rock',
  metal: 'Metal',
  electronica: 'Electronica',
  rock: 'Rock',
  jazz: 'Jazz',
  pop: 'Pop',
  'adult contemporary': 'Pop',
  'soft rock': 'Pop',
};

/**
 * Music8 / MusicBrainz の style・genre 文字列からアプリの SongStyle に寄せる。
 */
export function mapGenreTextsToSongStyle(texts: string[]): SongStyle | null {
  for (const raw of texts) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const direct = DIRECT_STYLE_NAME_TO_APP[key];
    if (direct) return direct;
  }
  const merged = texts
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' | ');
  if (!merged) return null;

  for (const rule of STYLE_NAME_TO_APP) {
    if (rule.re.test(merged)) return rule.style;
  }
  return null;
}

export function mapMusic8StyleIdsToSongStyle(ids: number[]): SongStyle | null {
  for (const id of ids) {
    const mapped = STYLE_ID_TO_APP[id];
    if (mapped) return mapped;
  }
  return null;
}

const NAV_SLUG_TO_APP: Record<string, SongStyle> = {
  pop: 'Pop',
  dance: 'Dance',
  alternative: 'Alternative rock',
  electronica: 'Electronica',
  rb: 'R&B',
  'hip-hop': 'Hip-hop',
  rock: 'Rock',
  metal: 'Metal',
  others: 'Other',
};

/** 1 曲登録の Music8 ナビ slug（`pop` 等）→ `songs.style`（`Pop` 等） */
export function mapMusic8NavSlugToAppSongStyle(slug: string | null | undefined): SongStyle | null {
  const key = (slug ?? '').trim().toLowerCase();
  if (!key) return null;
  return NAV_SLUG_TO_APP[key] ?? mapGenreTextsToSongStyle([key]);
}
