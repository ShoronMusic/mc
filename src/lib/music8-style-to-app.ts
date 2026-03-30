import type { SongStyle } from '@/lib/gemini';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

const STYLE_NAME_TO_APP: Array<{ re: RegExp; style: SongStyle }> = [
  { re: /\b(?:r&b|soul|afrobeats?)\b/i, style: 'R&B' },
  { re: /\b(?:hip[\s-]?hop|rap|trap)\b/i, style: 'Hip-hop' },
  { re: /\b(?:electronica|electronic|edm|house|techno|trance|drum\s*&?\s*bass|d&b|synthwave)\b/i, style: 'Electronica' },
  { re: /\b(?:dance|disco|funk)\b/i, style: 'Dance' },
  { re: /\b(?:alternative|indie|grunge|post[-\s]?punk)\b/i, style: 'Alternative rock' },
  { re: /\b(?:metal|hard\s*rock|heavy\s*metal)\b/i, style: 'Metal' },
  { re: /\b(?:rock|new wave|punk)\b/i, style: 'Rock' },
  { re: /\b(?:jazz|fusion|swing|bop)\b/i, style: 'Jazz' },
  { re: /\b(?:pop|adult contemporary|singer[-\s]?songwriter)\b/i, style: 'Pop' },
];

function normalizeFromMusic8Texts(texts: string[]): SongStyle | null {
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

/**
 * Music8 の style / genre からアプリの SongStyle に寄せる。
 * マップできない場合は null（呼び出し側で DB キャッシュ or Gemini へフォールバック）。
 */
export async function trySongStyleFromMusic8(
  artistName: string | null | undefined,
  fullVideoTitle: string | null | undefined
): Promise<SongStyle | null> {
  const artist = (artistName ?? '').trim();
  const title = (fullVideoTitle ?? '').trim();
  if (!artist || !title) return null;

  try {
    const data = await fetchMusic8SongDataForPlaybackRow(artist, title);
    if (!data) return null;

    const extracted = extractMusic8SongFields(data);
    const hit = normalizeFromMusic8Texts([...extracted.styleNames, ...extracted.genres]);
    return hit ?? null;
  } catch (e) {
    console.warn('[music8-style-to-app] lookup failed', e);
    return null;
  }
}

