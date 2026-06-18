import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';

export const dynamic = 'force-dynamic';

type LibrarySongDetail = {
  id: string;
  title: string;
  song_title: string | null;
  main_artist: string | null;
  style: string | null;
  genres: string | null;
  vocal: string | null;
  play_count: number | null;
  original_release_date: string | null;
};

type LibrarySongVideoItem = {
  video_id: string;
  variant: string | null;
};

function normalizeVariant(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  return t ? t : null;
}

function variantRank(raw: string | null | undefined): number {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

function inferVariantFromVideoTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').toLowerCase();
  if (!t) return null;
  if (/\blive\b|live at|live from|concert|acoustic session/.test(t)) return 'live';
  if (/\blyric\b|lyrics\b/.test(t)) return 'lyric';
  if (/\bofficial\b|official music video|official video|\bmv\b/.test(t)) return 'official';
  if (/\btopic\b/.test(t)) return 'topic';
  return null;
}

function formatGenres(raw: string[] | string | null | undefined): string | null {
  if (Array.isArray(raw)) {
    const joined = raw.filter((g) => typeof g === 'string' && g.trim()).join(', ');
    return joined || null;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

async function buildVideoItems(
  rows: { video_id?: string; variant?: string | null }[],
): Promise<LibrarySongVideoItem[]> {
  const unique = new Map<string, string | null>();
  for (const row of rows) {
    const videoId = typeof row.video_id === 'string' ? row.video_id.trim() : '';
    if (!videoId) continue;
    if (!unique.has(videoId)) unique.set(videoId, normalizeVariant(row.variant));
  }

  const items: LibrarySongVideoItem[] = await Promise.all(
    [...unique.entries()].map(async ([video_id, variant]) => {
      const title = (await fetchOEmbed(video_id))?.title ?? null;
      const inferred = inferVariantFromVideoTitle(title);
      return {
        video_id,
        variant: inferred ?? variant,
      };
    }),
  );

  items.sort((a, b) => variantRank(a.variant) - variantRank(b.variant));
  return items;
}

/**
 * GET: YouTube video_id からライブラリ曲情報＋動画候補を返す（マイページプレビュー用）。
 * Query: videoId（必須）
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const videoId = (new URL(request.url).searchParams.get('videoId') ?? '').trim();
  if (!videoId) {
    return NextResponse.json({ error: 'videoId が必要です。' }, { status: 400 });
  }

  const { data: svHit, error: svErr } = await admin
    .from('song_videos')
    .select('song_id')
    .eq('video_id', videoId)
    .limit(1)
    .maybeSingle();

  if (svErr && svErr.code !== '42P01') {
    console.error('[api/library/song-by-video] song_videos', svErr);
    return NextResponse.json({ error: '動画の検索に失敗しました。' }, { status: 500 });
  }

  const songId = typeof svHit?.song_id === 'string' ? svHit.song_id.trim() : '';
  if (!songId) {
    return NextResponse.json({
      song: null as LibrarySongDetail | null,
      videos: [{ video_id: videoId, variant: null }] as LibrarySongVideoItem[],
    });
  }

  const { data: songRow, error: songErr } = await admin
    .from('songs')
    .select(
      'id, display_title, song_title, main_artist, style, genres, vocal, play_count, original_release_date',
    )
    .eq('id', songId)
    .maybeSingle();

  if (songErr && songErr.code !== '42P01') {
    console.error('[api/library/song-by-video] songs', songErr);
    return NextResponse.json({ error: '曲情報の取得に失敗しました。' }, { status: 500 });
  }

  const { data: videoRows, error: vidErr } = await admin
    .from('song_videos')
    .select('video_id, variant, created_at')
    .eq('song_id', songId)
    .order('created_at', { ascending: true });

  if (vidErr && vidErr.code !== '42P01') {
    console.error('[api/library/song-by-video] videos', vidErr);
    return NextResponse.json({ error: '動画候補の取得に失敗しました。' }, { status: 500 });
  }

  const videos = await buildVideoItems((videoRows ?? []) as { video_id?: string; variant?: string | null }[]);
  const safeVideos =
    videos.length > 0 ? videos : ([{ video_id: videoId, variant: null }] as LibrarySongVideoItem[]);

  if (!songRow) {
    return NextResponse.json({ song: null, videos: safeVideos });
  }

  const s = songRow as {
    id?: string;
    display_title?: string | null;
    song_title?: string | null;
    main_artist?: string | null;
    style?: string | null;
    genres?: string[] | string | null;
    vocal?: string | null;
    play_count?: number | null;
    original_release_date?: string | null;
  };

  const song: LibrarySongDetail = {
    id: String(s.id ?? songId),
    title: (s.display_title ?? s.song_title ?? '').trim() || videoId,
    song_title: typeof s.song_title === 'string' ? s.song_title : null,
    main_artist: typeof s.main_artist === 'string' ? s.main_artist : null,
    style: typeof s.style === 'string' ? s.style : null,
    genres: formatGenres(s.genres),
    vocal: typeof s.vocal === 'string' ? s.vocal : null,
    play_count: typeof s.play_count === 'number' ? s.play_count : null,
    original_release_date:
      typeof s.original_release_date === 'string' ? s.original_release_date : null,
  };

  return NextResponse.json({ song, videos: safeVideos });
}
