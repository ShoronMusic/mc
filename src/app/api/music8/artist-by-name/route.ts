import { NextResponse } from 'next/server';
import {
  getMusic8ArtistJsonUrlCandidates,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';

export const dynamic = 'force-dynamic';

/**
 * Music8 アーティストJSONをサーバー経由で取得（ブラウザの CORS 影響を受けない）。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const artistName = url.searchParams.get('artistName')?.trim() ?? '';
  if (!artistName) {
    return NextResponse.json({ error: 'artistName is required' }, { status: 400 });
  }

  const artistUrls = getMusic8ArtistJsonUrlCandidates(artistName);
  if (!artistUrls.length) {
    return NextResponse.json({ artist: null });
  }

  for (const artistUrl of artistUrls) {
    try {
      const artist = await fetchJsonWithOptionalGcsAuth<Music8ArtistJson>(artistUrl);
      if (!artist) continue;
      return NextResponse.json({ artist });
    } catch {
      continue;
    }
  }
  return NextResponse.json({ artist: null });
}

