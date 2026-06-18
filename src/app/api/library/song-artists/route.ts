import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  extractMusic8SongArtistsForDisplay,
  type Music8SongArtistDisplayItem,
} from '@/lib/music8-song-artists-display';
import { fetchMusic8WpSongJsonForLibrary } from '@/lib/music8-wp-song-json-for-library';

export const dynamic = 'force-dynamic';

function rankVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

/**
 * GET: ライブラリ曲詳細用の Music8 順アーティスト一覧。
 * Query: songId（必須）, videoId（任意・slug 候補の一致確認用）
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const songId = (url.searchParams.get('songId') ?? '').trim();
  const videoIdParam = (url.searchParams.get('videoId') ?? '').trim();
  if (!songId) {
    return NextResponse.json({ error: 'songId が必要です。' }, { status: 400 });
  }

  const { data: song, error } = await admin
    .from('songs')
    .select(
      'id, main_artist, music8_artist_slug, music8_song_slug, spotify_artists, music8_video_id',
    )
    .eq('id', songId)
    .maybeSingle();

  if (error) {
    if (error.code === '42703') {
      const { data: song2, error: error2 } = await admin
        .from('songs')
        .select('id, main_artist, music8_artist_slug, music8_song_slug')
        .eq('id', songId)
        .maybeSingle();
      if (error2 || !song2) {
        return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
      }
      return respondArtists(
        { ...song2, id: songId } as {
          id: string;
          main_artist?: string | null;
          music8_artist_slug?: string | null;
        },
        videoIdParam,
        null,
        null,
      );
    }
    console.error('[api/library/song-artists]', error);
    return NextResponse.json({ error: '曲の取得に失敗しました。' }, { status: 500 });
  }

  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  const songRow = song as {
    id: string;
    main_artist?: string | null;
    music8_artist_slug?: string | null;
    music8_song_slug?: string | null;
    spotify_artists?: string | null;
    music8_video_id?: string | null;
  };

  let videoId = videoIdParam || songRow.music8_video_id?.trim() || '';
  if (!videoId) {
    const { data: vrows } = await admin
      .from('song_videos')
      .select('video_id, variant, created_at')
      .eq('song_id', songId);
    let best: { videoId: string; rank: number; createdAt: string } | null = null;
    for (const row of vrows ?? []) {
      const cast = row as { video_id?: string; variant?: string | null; created_at?: string };
      const vid = (cast.video_id ?? '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
      const rank = rankVariant(cast.variant);
      const createdAt = (cast.created_at ?? '').trim();
      if (!best || rank < best.rank || (rank === best.rank && createdAt > best.createdAt)) {
        best = { videoId: vid, rank, createdAt };
      }
    }
    videoId = best?.videoId ?? '';
  }

  const spotifyArtists = songRow.spotify_artists ?? null;

  const fetched = await fetchMusic8WpSongJsonForLibrary({
    music8ArtistSlug: songRow.music8_artist_slug,
    music8SongSlug: songRow.music8_song_slug,
    spotifyArtists,
    mainArtist: songRow.main_artist,
    videoId: videoId || null,
  });

  return respondArtists(songRow, videoId, fetched?.json ?? null, fetched?.canonicalArtistSlug ?? null);
}

function respondArtists(
  song: {
    id?: string;
    main_artist?: string | null;
    music8_artist_slug?: string | null;
  } | null,
  videoId: string,
  json: Record<string, unknown> | null,
  canonicalArtistSlug: string | null,
) {
  let artists: Music8SongArtistDisplayItem[] = [];
  if (json) {
    artists = extractMusic8SongArtistsForDisplay(
      json,
      canonicalArtistSlug ?? (song as { music8_artist_slug?: string | null })?.music8_artist_slug,
    );
  }

  if (artists.length === 0) {
    const main = (song?.main_artist ?? '').trim();
    if (main) {
      artists = [{ name: main, slug: null, role: 'main' }];
    }
  }

  return NextResponse.json({
    songId: (song as { id?: string } | null)?.id ?? null,
    videoId: videoId || null,
    artists,
  });
}
