import { NextResponse } from 'next/server';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';

export const dynamic = 'force-dynamic';

/**
 * 視聴履歴行（artist + title）から Music8 曲データをサーバー経由で解決。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const artistName = url.searchParams.get('artistName')?.trim() ?? '';
  const songTitle = url.searchParams.get('songTitle')?.trim() ?? '';
  if (!artistName || !songTitle) {
    return NextResponse.json({ error: 'artistName and songTitle are required' }, { status: 400 });
  }

  try {
    const song = await fetchMusic8SongDataForPlaybackRow(artistName, songTitle, {
      fetchJson: fetchJsonWithOptionalGcsAuth,
    });
    return NextResponse.json({ song });
  } catch {
    return NextResponse.json({ song: null });
  }
}

