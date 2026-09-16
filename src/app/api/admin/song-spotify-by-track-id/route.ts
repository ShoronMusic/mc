import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import { applyManualSpotifyTrackIdToSong, clearSpotifyMetaFromSong } from '@/lib/admin-song-spotify-by-track-id';

export const dynamic = 'force-dynamic';

type ReqBody = {
  songId?: unknown;
  spotifyTrackId?: unknown;
  clear?: unknown;
  action?: unknown;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId : '';
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const clear = body.clear === true || action === 'clear';

  if (clear) {
    const result = await clearSpotifyMetaFromSong(admin, songId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    clearLibraryArtistIndexCache();
    return NextResponse.json({
      ...result,
      message: 'Spotify の track ID と関連値を空にしました。',
    });
  }

  const spotifyTrackId = typeof body.spotifyTrackId === 'string' ? body.spotifyTrackId : '';

  const result = await applyManualSpotifyTrackIdToSong(admin, songId, spotifyTrackId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  clearLibraryArtistIndexCache();
  return NextResponse.json({
    ...result,
    message: `反映しました（track: ${result.spotifyTrackId} / 人気: ${result.spotifyPopularity ?? '—'}）。`,
  });
}
