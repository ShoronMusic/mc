import 'server-only';

import {
  getMusic8ArtistJsonUrlCandidates,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';

/** Music8 GCS アーティスト JSON を名前から取得（サーバー専用） */
export async function fetchMusic8ArtistJsonByName(
  artistName: string,
): Promise<Music8ArtistJson | null> {
  const name = artistName.trim();
  if (!name) return null;

  const artistUrls = getMusic8ArtistJsonUrlCandidates(name);
  for (const artistUrl of artistUrls) {
    try {
      const artist = await fetchJsonWithOptionalGcsAuth<Music8ArtistJson>(artistUrl);
      if (artist) return artist;
    } catch {
      continue;
    }
  }
  return null;
}
