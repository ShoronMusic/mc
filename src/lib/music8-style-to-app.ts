/**
 * Music8 曲 JSON のスタイル名を、アプリの song_style / Gemini と同じ SongStyle に正規化する。
 */

import type { SongStyle } from '@/lib/gemini';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';
import { SONG_STYLE_OPTIONS, type SongStyleOption } from '@/lib/song-styles';

export function mapMusic8StyleLabelToSongStyle(raw: string): SongStyle | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  if (SONG_STYLE_OPTIONS.includes(s as SongStyleOption)) {
    return s as SongStyle;
  }

  const lower = s.toLowerCase().replace(/\s+/g, ' ');
  const aliases: Record<string, SongStyle> = {
    'hip-hop': 'Hip-hop',
    'hip hop': 'Hip-hop',
    alternative: 'Alternative rock',
    'alternative rock': 'Alternative rock',
    others: 'Other',
    other: 'Other',
    pop: 'Pop',
    dance: 'Dance',
    electronica: 'Electronica',
    'r&b': 'R&B',
    rock: 'Rock',
    metal: 'Metal',
    jazz: 'Jazz',
    /** Music8 など「Soft rock」「New wave」表記 */
    'soft rock': 'Rock',
    'hard rock': 'Rock',
    'new wave': 'Alternative rock',
    'progressive rock': 'Rock',
    'classic rock': 'Rock',
    'soul': 'R&B',
    funk: 'Dance',
    disco: 'Dance',
  };
  const hit = aliases[lower];
  return hit ?? null;
}

/**
 * Music8 に曲がマッチし style が取れたときだけ SongStyle を返す。
 */
export async function trySongStyleFromMusic8(
  artistName: string | null | undefined,
  fullVideoTitle: string | null | undefined
): Promise<SongStyle | null> {
  const main = (artistName ?? '').trim();
  const yt = (fullVideoTitle ?? '').trim();
  if (!main && !yt) return null;

  try {
    const data = await fetchMusic8SongDataForPlaybackRow(main, yt || main);
    if (!data) return null;
    const fields = extractMusic8SongFields(data);
    for (const name of fields.styleNames) {
      const mapped = mapMusic8StyleLabelToSongStyle(name);
      if (mapped) return mapped;
    }
    for (const g of fields.genres) {
      const mapped = mapMusic8StyleLabelToSongStyle(g);
      if (mapped) return mapped;
    }
  } catch (e) {
    console.error('[music8-style-to-app] trySongStyleFromMusic8', e);
  }
  return null;
}
