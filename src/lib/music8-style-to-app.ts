import type { SongStyle } from '@/lib/gemini';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';
import {
  mapGenreTextsToSongStyle,
  mapMusic8StyleIdsToSongStyle,
} from '@/lib/music8-genre-style-map';

export { mapGenreTextsToSongStyle } from '@/lib/music8-genre-style-map';

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
      mapMusic8StyleIdsToSongStyle(extracted.styleIds) ??
      mapGenreTextsToSongStyle(extracted.styleNames) ??
      mapGenreTextsToSongStyle(extracted.genres);
    return { songDataFound: true, style: hit ?? null };
  } catch (e) {
    console.warn('[music8-style-to-app] lookup failed', e);
    return { songDataFound: false, style: null };
  }
}
