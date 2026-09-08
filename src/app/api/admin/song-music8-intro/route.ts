import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  buildKnownFactsLines,
  generateMusic8SongIntro,
} from '@/lib/music8-song-intro-gemini';
import { buildYoutubeMetadataFactsBlock } from '@/lib/commentary-youtube-facts';
import { getVideoSnippet } from '@/lib/youtube-search';
import type { AdminSongMusic8IntroResponse } from '@/lib/admin-song-music8-intro-types';

export const dynamic = 'force-dynamic';

export type { AdminSongMusic8IntroResponse } from '@/lib/admin-song-music8-intro-types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  songId?: unknown;
  action?: unknown;
  text?: unknown;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者 DB クライアントを作成できません。' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON が必要です。' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (action !== 'generate' && action !== 'save') {
    return NextResponse.json({ error: 'action は generate または save です。' }, { status: 400 });
  }

  if (action === 'save') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const { error } = await admin.from('songs').update({ music8_intro: text || null }).eq('id', songId);
    if (error?.code === '42703') {
      return NextResponse.json(
        {
          error:
            'songs.music8_intro 列がありません。docs/sql/music8-catalog-extension.sql を SQL Editor で実行してください。',
          columnMissing: true,
        } satisfies AdminSongMusic8IntroResponse,
        { status: 400 },
      );
    }
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ saved: true, text } satisfies AdminSongMusic8IntroResponse);
  }

  const { data, error } = await admin
    .from('songs')
    .select('main_artist, song_title, original_release_date, style, vocal, genres')
    .eq('id', songId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  const { data: videos } = await admin
    .from('song_videos')
    .select('video_id, variant')
    .eq('song_id', songId);
  const videoRows = Array.isArray(videos) ? videos : [];
  const primaryVideoId =
    (videoRows.find((v) => (v as { variant?: string }).variant === 'official') as { video_id?: string } | undefined)
      ?.video_id?.trim() ||
    (videoRows[0] as { video_id?: string } | undefined)?.video_id?.trim() ||
    '';
  let youtubeFacts = '';
  if (primaryVideoId) {
    try {
      const snippet = await getVideoSnippet(primaryVideoId, { source: 'admin/song-music8-intro' });
      youtubeFacts = buildYoutubeMetadataFactsBlock({
        description: snippet?.description ?? null,
        publishedAt: snippet?.publishedAt ?? null,
        channelTitle: snippet?.channelTitle ?? null,
      });
    } catch (e) {
      console.warn(
        '[admin/song-music8-intro] youtube snippet',
        e instanceof Error ? e.message : e,
      );
    }
  }

  const row = data as {
    main_artist?: string | null;
    song_title?: string | null;
    original_release_date?: string | null;
    style?: string | null;
    vocal?: string | null;
    genres?: string[] | null;
  };
  const artist = (row.main_artist ?? '').trim();
  const title = (row.song_title ?? '').trim();
  if (!artist || !title) {
    return NextResponse.json({ error: 'メインアーティストと曲タイトルが必要です。先に基本情報を保存してください。' }, { status: 400 });
  }

  const { count: creditCount } = await admin
    .from('song_credits')
    .select('artist_id', { count: 'exact', head: true })
    .eq('song_id', songId);
  const hasNamedFeaturedArtist = (creditCount ?? 0) > 1;

  const generated = await generateMusic8SongIntro({
    artist,
    title,
    knownFacts: buildKnownFactsLines({
      originalReleaseDate: row.original_release_date,
      style: row.style,
      vocal: row.vocal,
      genres: Array.isArray(row.genres) ? row.genres : null,
      youtubeFacts: youtubeFacts || null,
      artistDisplay: artist,
      hasNamedFeaturedArtist,
    }),
    usageMeta: { userId: (await gate.supabase.auth.getUser()).data.user?.id ?? null },
  });

  if ('error' in generated) {
    return NextResponse.json({ error: generated.error }, { status: 502 });
  }
  return NextResponse.json({
    text: generated.text,
    incomplete: generated.incomplete === true,
  } satisfies AdminSongMusic8IntroResponse);
}
