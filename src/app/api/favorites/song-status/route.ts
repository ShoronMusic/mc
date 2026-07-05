import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { resolveFavoriteVideoMetadata } from '@/lib/favorite-video-metadata';

export const dynamic = 'force-dynamic';

const VIDEO_ID_CHUNK = 40;

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripLeadingThe(s: string): string {
  return s.replace(/^the\s+/, '');
}

function artistsCompatible(a: string, b: string): boolean {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = stripLeadingThe(na);
  const sb = stripLeadingThe(nb);
  return sa === sb || sa.includes(sb) || sb.includes(sa);
}

function titlesCompatible(a: string, b: string): boolean {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/**
 * GET: ログインユーザーのお気に入りのうち、指定 song_id に紐づく video_id 一覧。
 * Query: songId（必須）
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const songId = (new URL(request.url).searchParams.get('songId') ?? '').trim();
  if (!songId) {
    return NextResponse.json({ error: 'songId is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const { data: favRows, error: favErr } = await supabase
    .from('user_favorites')
    .select('video_id, title, artist_name')
    .eq('user_id', user.id);

  if (favErr) {
    if (favErr.code === '42P01') {
      return NextResponse.json({ favoritedVideoIds: [] as string[], isFavorited: false });
    }
    console.error('[favorites/song-status GET]', favErr);
    return NextResponse.json({ error: favErr.message }, { status: 500 });
  }

  const favoriteRows = (favRows ?? [])
    .map((row) => ({
      videoId: typeof row.video_id === 'string' ? row.video_id.trim() : '',
      title: typeof row.title === 'string' ? row.title.trim() : '',
      artistName: typeof row.artist_name === 'string' ? row.artist_name.trim() : '',
    }))
    .filter((row) => row.videoId);

  if (favoriteRows.length === 0) {
    return NextResponse.json({ favoritedVideoIds: [], isFavorited: false });
  }

  const matched = new Set<string>();
  const favoriteVideoIds = favoriteRows.map((row) => row.videoId);

  for (let i = 0; i < favoriteVideoIds.length; i += VIDEO_ID_CHUNK) {
    const chunk = favoriteVideoIds.slice(i, i + VIDEO_ID_CHUNK);
    const { data: svRows, error: svErr } = await admin
      .from('song_videos')
      .select('video_id')
      .eq('song_id', songId)
      .in('video_id', chunk);

    if (svErr) {
      if (svErr.code === '42P01') {
        break;
      }
      console.error('[favorites/song-status GET] song_videos', svErr);
      return NextResponse.json({ error: '動画の照合に失敗しました。' }, { status: 500 });
    }

    for (const row of svRows ?? []) {
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      if (vid) matched.add(vid);
    }
  }

  if (matched.size < favoriteRows.length) {
    const { data: songRow } = await admin
      .from('songs')
      .select('main_artist, song_title, display_title')
      .eq('id', songId)
      .maybeSingle();

    const songTitle = (
      (typeof songRow?.song_title === 'string' ? songRow.song_title : '') ||
      (typeof songRow?.display_title === 'string' ? songRow.display_title : '')
    ).trim();
    const songArtist = typeof songRow?.main_artist === 'string' ? songRow.main_artist.trim() : '';

    if (songTitle) {
      for (const fav of favoriteRows) {
        if (matched.has(fav.videoId)) continue;

        let favTitle = fav.title;
        let favArtist = fav.artistName;
        if (!favTitle || !favArtist) {
          const resolved = await resolveFavoriteVideoMetadata(admin, fav.videoId);
          if (!favTitle) favTitle = resolved.title ?? '';
          if (!favArtist) favArtist = resolved.artistName ?? '';
        }

        if (titlesCompatible(favTitle, songTitle) && artistsCompatible(favArtist, songArtist)) {
          matched.add(fav.videoId);
        }
      }
    }
  }

  const favoritedVideoIds = [...matched];
  return NextResponse.json({
    favoritedVideoIds,
    isFavorited: favoritedVideoIds.length > 0,
  });
}
