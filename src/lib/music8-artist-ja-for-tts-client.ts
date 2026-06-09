'use client';

import {
  getMusic8ArtistJapaneseName,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';

/** メインアーティスト欄と同じ Music8 JSON から日本語アーティスト名を取得（TTS 用） */
export async function fetchMusic8ArtistJapaneseNameForTts(
  artistName: string,
): Promise<string | null> {
  const name = artistName.trim();
  if (!name) return null;
  try {
    const res = await fetch(
      `/api/music8/artist-by-name?artistName=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { artist?: unknown } | null;
    const artist = json?.artist;
    if (!artist || typeof artist !== 'object') return null;
    return getMusic8ArtistJapaneseName(artist as Music8ArtistJson);
  } catch {
    return null;
  }
}
