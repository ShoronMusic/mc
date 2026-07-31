import 'server-only';

import {
  getMusic8ArtistJsonUrlCandidates,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';

const MUSIC8_ARTIST_CACHE_TTL_MS = 60 * 60 * 1000;
const MUSIC8_ARTIST_MISS_CACHE_TTL_MS = 5 * 60 * 1000;
const MUSIC8_ARTIST_CACHE_MAX = 300;

type Music8ArtistCacheEntry = {
  expiresAt: number;
  value: Music8ArtistJson | null;
};

const music8ArtistCache = new Map<string, Music8ArtistCacheEntry>();
const music8ArtistInFlight = new Map<string, Promise<Music8ArtistJson | null>>();

function music8ArtistCacheKey(name: string): string {
  return name.trim().toLocaleLowerCase('en-US');
}

/** Music8 GCS アーティスト JSON を名前から取得（サーバー専用） */
export async function fetchMusic8ArtistJsonByName(
  artistName: string,
): Promise<Music8ArtistJson | null> {
  const name = artistName.trim();
  if (!name) return null;

  const key = music8ArtistCacheKey(name);
  const now = Date.now();
  const cached = music8ArtistCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) music8ArtistCache.delete(key);

  const pending = music8ArtistInFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    let value: Music8ArtistJson | null = null;
    const artistUrls = getMusic8ArtistJsonUrlCandidates(name);
    for (const artistUrl of artistUrls) {
      try {
        const artist = await fetchJsonWithOptionalGcsAuth<Music8ArtistJson>(artistUrl);
        if (artist) {
          value = artist;
          break;
        }
      } catch {
        continue;
      }
    }

    if (music8ArtistCache.size >= MUSIC8_ARTIST_CACHE_MAX) {
      music8ArtistCache.clear();
    }
    music8ArtistCache.set(key, {
      value,
      expiresAt:
        Date.now() +
        (value ? MUSIC8_ARTIST_CACHE_TTL_MS : MUSIC8_ARTIST_MISS_CACHE_TTL_MS),
    });
    return value;
  })();

  music8ArtistInFlight.set(key, request);
  try {
    return await request;
  } finally {
    music8ArtistInFlight.delete(key);
  }
}
