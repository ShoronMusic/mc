import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import { applyManualSpotifyArtistIdToArtist } from '@/lib/admin-artist-spotify-by-id';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistId?: unknown;
  spotifyArtistId?: unknown;
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

  const artistId = typeof body.artistId === 'string' ? body.artistId : '';
  const spotifyArtistId = typeof body.spotifyArtistId === 'string' ? body.spotifyArtistId : '';

  const result = await applyManualSpotifyArtistIdToArtist(admin, artistId, spotifyArtistId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  clearLibraryArtistIndexCache();
  return NextResponse.json({
    ...result,
    message: `反映しました（${result.spotifyArtistName} / 人気: ${result.spotifyArtistPopularity ?? '—'}）。`,
  });
}
