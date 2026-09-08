import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  buildExistingSongIlikePatterns,
  rankExistingSongsForNewRegister,
  type ExistingSongMatchCandidate,
  type ExistingSongRowForMatch,
} from '@/lib/admin-new-song-existing-match';
import type { AdminSongsRegisterResponse } from '@/lib/admin-songs-register-types';
import { inferSongVideoVariantFromTitle, MAX_SONG_VIDEO_VARIANTS } from '@/lib/song-alternate-pv-match';
import { registerWesternSongFromYoutube } from '@/lib/music8-catalog-register';
import { MUSIC8_NAV_STYLE_SLUGS, youtubeVideoIdFromUnknown } from '@/lib/music8-catalog-slugs';
import { getVideoSnippet } from '@/lib/youtube-search';
import { dateOnlyFromYoutubePublishedAt } from '@/lib/youtube-published-at-date';
import { getArtistDisplayString } from '@/lib/format-song-display';

export const dynamic = 'force-dynamic';

export type { AdminSongsRegisterResponse } from '@/lib/admin-songs-register-types';

async function loadExistingMatchesForRegister(opts: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  artist: string;
  title: string;
  videoId: string | null;
  youtubeTitle: string | null;
  description: string | null;
  channelId: string | null;
}): Promise<{
  existingMatches: ExistingSongMatchCandidate[];
  videoAlreadyOnSongId: string | null;
}> {
  const artist = getArtistDisplayString(opts.artist) || opts.artist.trim();
  const title = opts.title.trim();
  if (!artist || !title) {
    return { existingMatches: [], videoAlreadyOnSongId: null };
  }

  let videoAlreadyOnSongId: string | null = null;
  if (opts.videoId) {
    const { data: vidRow } = await opts.admin
      .from('song_videos')
      .select('song_id')
      .eq('video_id', opts.videoId)
      .maybeSingle();
    const sid = (vidRow as { song_id?: string } | null)?.song_id;
    if (typeof sid === 'string' && sid) videoAlreadyOnSongId = sid;
  }

  const patterns = buildExistingSongIlikePatterns(artist, title);
  if (!patterns.titleLike) {
    return { existingMatches: [], videoAlreadyOnSongId };
  }

  // まず「メインアーティスト × 曲名」を優先取得（Still のような短曲名の誤ヒットで押し出されないように）
  const byArtistTitle: ExistingSongRowForMatch[] = [];
  if (patterns.artistPrimaryLike && patterns.titleLike) {
    const preferred = await opts.admin
      .from('songs')
      .select('id, display_title, main_artist, song_title')
      .ilike('main_artist', patterns.artistPrimaryLike)
      .ilike('song_title', patterns.titleLike)
      .limit(40);
    if (!preferred.error) {
      byArtistTitle.push(...((preferred.data ?? []) as ExistingSongRowForMatch[]));
    } else if (preferred.error.code !== '42P01') {
      console.warn('[admin/songs-register] preferred existing lookup', preferred.error.message);
    }
  }

  const orParts = [`song_title.ilike.${patterns.titleLike}`, `display_title.ilike.${patterns.titleLike}`];
  if (patterns.displayLike) orParts.push(`display_title.ilike.${patterns.displayLike}`);
  if (patterns.artistPrimaryLike) orParts.push(`main_artist.ilike.${patterns.artistPrimaryLike}`);

  const { data: songData, error: songErr } = await opts.admin
    .from('songs')
    .select('id, display_title, main_artist, song_title')
    .or(orParts.join(','))
    .limit(80);

  if (songErr && songErr.code !== '42P01') {
    console.warn('[admin/songs-register] existing song lookup', songErr.message);
    return { existingMatches: [], videoAlreadyOnSongId };
  }

  const seen = new Set<string>();
  const rows: ExistingSongRowForMatch[] = [];
  for (const row of [...byArtistTitle, ...((songData ?? []) as ExistingSongRowForMatch[])]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }

  const ids = rows.map((r) => r.id).filter(Boolean);
  const videosBySongId = new Map<string, { videoId: string; channelId?: string | null }[]>();
  if (ids.length > 0) {
    const { data: vidRows } = await opts.admin
      .from('song_videos')
      .select('song_id, video_id')
      .in('song_id', ids);
    for (const raw of vidRows ?? []) {
      const r = raw as { song_id?: string; video_id?: string };
      const sid = typeof r.song_id === 'string' ? r.song_id : '';
      const vid = typeof r.video_id === 'string' ? r.video_id : '';
      if (!sid || !vid) continue;
      const list = videosBySongId.get(sid) ?? [];
      list.push({ videoId: vid });
      videosBySongId.set(sid, list);
    }
  }

  const existingMatches = rankExistingSongsForNewRegister({
    incomingArtist: artist,
    incomingTitle: title,
    incomingYoutubeTitle: opts.youtubeTitle,
    incomingDescription: opts.description,
    incomingChannelId: opts.channelId,
    youtubeId: opts.videoId,
    rows,
    videosBySongId,
  }).slice(0, 8);

  return { existingMatches, videoAlreadyOnSongId };
}

/** YouTube 公開日の先読み＋既存曲候補（1曲登録ページ） */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者 DB クライアントを作成できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('youtube_id') ?? searchParams.get('youtubeId') ?? '';
  const videoId = youtubeVideoIdFromUnknown(raw);
  const artist = (searchParams.get('artist') ?? '').trim();
  const title = (searchParams.get('title') ?? '').trim();

  if (!videoId && !artist && !title) {
    return NextResponse.json({ error: 'youtube_id または artist/title が必要です。' }, { status: 400 });
  }

  let youtubeTitle: string | null = null;
  let youtubePublishedAt: string | null = null;
  let description: string | null = null;
  let channelId: string | null = null;
  let suggestedVariant: string | null = null;

  if (videoId) {
    const snippet = await getVideoSnippet(videoId, { source: 'admin-songs-register-preview' });
    const iso = typeof snippet?.publishedAt === 'string' ? snippet.publishedAt.trim() : '';
    youtubePublishedAt = dateOnlyFromYoutubePublishedAt(iso);
    youtubeTitle = typeof snippet?.title === 'string' ? snippet.title.trim() || null : null;
    description = typeof snippet?.description === 'string' ? snippet.description : null;
    channelId = typeof snippet?.channelId === 'string' ? snippet.channelId.trim() || null : null;
    suggestedVariant = inferSongVideoVariantFromTitle(youtubeTitle) || 'official';
  }

  const { existingMatches, videoAlreadyOnSongId } = await loadExistingMatchesForRegister({
    admin,
    artist,
    title,
    videoId,
    youtubeTitle,
    description,
    channelId,
  });

  return NextResponse.json({
    videoId: videoId || undefined,
    youtubePublishedAt,
    youtubeTitle,
    suggestedVariant,
    existingMatches,
    videoAlreadyOnSongId,
    maxSongVideoVariants: MAX_SONG_VIDEO_VARIANTS,
  } satisfies AdminSongsRegisterResponse & { maxSongVideoVariants: number });
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者 DB クライアントを作成できません。' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON が必要です。' }, { status: 400 });
  }

  const youtubeId = typeof body.youtube_id === 'string' ? body.youtube_id : typeof body.youtubeId === 'string' ? body.youtubeId : '';
  const artist = typeof body.artist === 'string' ? body.artist : '';
  const title = typeof body.title === 'string' ? body.title : '';
  const styleSlug = typeof body.style === 'string' ? body.style.trim().toLowerCase() : '';
  const skipExport = body.export_json === false || body.exportJson === false;

  try {
    const result = await registerWesternSongFromYoutube(admin, {
      youtubeId,
      artist,
      title,
      styleSlug: styleSlug && (MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(styleSlug) ? styleSlug : null,
      catalogScope: 'western',
      exportJson: !skipExport,
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      songId: result.songId,
      videoId: result.videoId,
      exportPath: result.exportPath,
      exportSkipped: result.exportSkipped,
      youtubePublishedAt: result.youtubePublishedAt,
    } satisfies AdminSongsRegisterResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[admin/songs-register] POST', msg);
    return NextResponse.json(
      { error: `登録中にエラーが発生しました: ${msg.slice(0, 200)}` },
      { status: 500 },
    );
  }
}
