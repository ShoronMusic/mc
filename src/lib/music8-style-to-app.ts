import type { SongStyle } from '@/lib/gemini';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

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
  { re: /\b(?:r&b|soul|afrobeats?)\b/i, style: 'R&B' },
  { re: /\b(?:hip[\s-]?hop|rap|trap)\b/i, style: 'Hip-hop' },
  { re: /\b(?:dance|disco|funk)\b/i, style: 'Dance' },
  { re: /\b(?:alternative|indie|grunge|post[-\s]?punk)\b/i, style: 'Alternative rock' },
  { re: /\b(?:metal|hard\s*rock|heavy\s*metal)\b/i, style: 'Metal' },
  { re: /\b(?:electronica|electronic|edm|house|techno|trance|drum\s*&?\s*bass|d&b|synthwave)\b/i, style: 'Electronica' },
  { re: /\b(?:rock|new wave|punk)\b/i, style: 'Rock' },
  { re: /\b(?:jazz|fusion|swing|bop)\b/i, style: 'Jazz' },
  { re: /\b(?:pop|adult contemporary|singer[-\s]?songwriter)\b/i, style: 'Pop' },
];

const DIRECT_STYLE_NAME_TO_APP: Record<string, SongStyle> = {
  'r&b': 'R&B',
  'hip-hop': 'Hip-hop',
  dance: 'Dance',
  'alternative rock': 'Alternative rock',
  metal: 'Metal',
  electronica: 'Electronica',
  rock: 'Rock',
  jazz: 'Jazz',
  pop: 'Pop',
};

function normalizeFromMusic8Texts(texts: string[]): SongStyle | null {
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

function normalizeFromMusic8StyleIds(ids: number[]): SongStyle | null {
  for (const id of ids) {
    const mapped = STYLE_ID_TO_APP[id];
    if (mapped) return mapped;
  }
  return null;
}

export type Music8StyleLookupResult = {
  songDataFound: boolean;
  style: SongStyle | null;
};

/**
 * Music8 の style / genre からアプリの SongStyle に寄せる。
 * マップできない場合は null（呼び出し側で DB キャッシュ or Gemini へフォールバック）。
 */
export async function trySongStyleFromMusic8(
  artistName: string | null | undefined,
  fullVideoTitle: string | null | undefined
): Promise<Music8StyleLookupResult> {
  const artist = (artistName ?? '').trim();
  const title = (fullVideoTitle ?? '').trim();
  if (!artist || !title) return { songDataFound: false, style: null };

  try {
    const data = await fetchMusic8SongDataForPlaybackRow(artist, title, {
      fetchJson: fetchJsonWithOptionalGcsAuth,
    });
    if (!data) return { songDataFound: false, style: null };

    const extracted = extractMusic8SongFields(data);
    const hit =
      normalizeFromMusic8StyleIds(extracted.styleIds) ??
      normalizeFromMusic8Texts(extracted.styleNames) ??
      normalizeFromMusic8Texts(extracted.genres);
    return { songDataFound: true, style: hit ?? null };
  } catch (e) {
    console.warn('[music8-style-to-app] lookup failed', e);
    return { songDataFound: false, style: null };
  }
}

