import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import {
  buildExplicitCreditArtists,
  parseCreditArtistsInput,
} from '@/lib/admin-domestic-artist-playlist';
import { ensureDomesticArtistForSongRegistration } from '@/lib/artist-selection-register';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsForSong,
} from '@/lib/song-credits-sync';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReqBody = {
  songId?: unknown;
  /** メイン以外の共演者（カンマ区切り文字列 or 配列） */
  featuredArtists?: unknown;
  /** 全クレジット名を明示（上書き。配列） */
  creditArtists?: unknown;
};

function parseFeaturedArtists(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean);
  }
  if (typeof raw === 'string') return parseCreditArtistsInput(raw);
  return [];
}

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

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('id, main_artist, display_title')
    .eq('id', songId)
    .maybeSingle();
  if (songErr) {
    return NextResponse.json({ error: songErr.message }, { status: 502 });
  }
  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  const mainArtist = (song as { main_artist?: string | null }).main_artist?.trim() ?? '';
  const displayTitle = (song as { display_title?: string | null }).display_title?.trim() ?? null;
  if (!mainArtist) {
    return NextResponse.json({ error: 'main_artist が空です。先に基本情報を設定してください。' }, { status: 400 });
  }

  let explicitNames: string[];
  const overrideCredits = parseFeaturedArtists(body.creditArtists);
  if (overrideCredits.length > 0) {
    explicitNames = buildExplicitCreditArtists('', overrideCredits);
    if (!explicitNames.some((n) => n.toLowerCase() === mainArtist.toLowerCase())) {
      explicitNames = buildExplicitCreditArtists(mainArtist, overrideCredits);
    }
  } else {
    const featured = parseFeaturedArtists(body.featuredArtists);
    explicitNames = buildExplicitCreditArtists(mainArtist, featured);
  }

  if (explicitNames.length === 0) {
    return NextResponse.json({ error: 'クレジット名が空です。' }, { status: 400 });
  }

  try {
    const index = await loadArtistLookupIndex(admin);
    for (const name of explicitNames) {
      await ensureDomesticArtistForSongRegistration(admin, name, { index });
    }
    clearArtistLookupIndexCache();
    const freshIndex = await loadArtistLookupIndex(admin);

    const result = await syncSongCreditsForSong(
      admin,
      songId,
      {
        main_artist: mainArtist,
        display_title: displayTitle,
        spotify_artists: null,
        music8_song_data: null,
        explicitCreditArtists: explicitNames,
      },
      freshIndex,
      true,
    );

    clearLibraryArtistIndexCache();

    return NextResponse.json({
      ok: true,
      songId,
      creditCount: result.creditCount,
      unresolved: result.unresolved,
      applied: result.applied,
      artists: explicitNames,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'song_credits 同期に失敗しました。';
    console.error('[admin/song-credits-sync]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
