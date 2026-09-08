import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import { applySongDisplayFromSpotifyArtists } from '@/lib/song-display-from-spotify-artists';
import { syncSongCreditsFromSongId } from '@/lib/song-credits-sync';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Spotify 並びで main_artist / display_title を揃え、song_credits も再同期 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  try {
    const aligned = await applySongDisplayFromSpotifyArtists(admin, songId);
    const credits = await syncSongCreditsFromSongId(admin, songId, true);
    clearLibraryArtistIndexCache();

    if (!aligned.updated && aligned.skippedReason === 'no_change_or_no_spotify') {
      return NextResponse.json({
        ok: true,
        updated: false,
        message: 'spotify_artists / track が無い、または既に一致しています。',
        creditCount: credits?.creditCount ?? 0,
      });
    }

    return NextResponse.json({
      ok: true,
      updated: aligned.updated,
      mainArtist: aligned.mainArtist ?? null,
      displayTitle: aligned.displayTitle ?? null,
      skippedReason: aligned.skippedReason ?? null,
      creditCount: credits?.creditCount ?? 0,
      message: aligned.updated
        ? `表示を Spotify 並び順に更新しました: ${aligned.displayTitle ?? aligned.mainArtist}`
        : '表示の更新はありませんでした。',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新に失敗しました。';
    console.error('[admin/song-align-display-from-spotify]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
