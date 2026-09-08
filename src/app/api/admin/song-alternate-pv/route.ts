import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { extractVideoId } from '@/lib/youtube';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getArtistAndSong } from '@/lib/format-song-display';
import {
  canAddSongVideoVariant,
  inferSongVideoVariantFromTitle,
  matchAlternatePvToExistingSong,
  shouldBackfillSongVideoVariant,
  MAX_SONG_VIDEO_VARIANTS,
} from '@/lib/song-alternate-pv-match';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseVideoIdInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return extractVideoId(t) ?? (/^[a-zA-Z0-9_-]{11}$/.test(t) ? t : null);
}

type SongRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: unknown; url?: unknown; action?: unknown; variant?: unknown; force?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }
  const videoId = parseVideoIdInput(typeof body.url === 'string' ? body.url : '');
  if (!videoId) {
    return NextResponse.json({ error: 'YouTube URL または video_id を入力してください。' }, { status: 400 });
  }
  const action = body.action === 'add' ? 'add' : 'preview';
  const force = body.force === true;
  const variantOverride =
    typeof body.variant === 'string' && body.variant.trim() ? body.variant.trim().toLowerCase() : null;

  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title')
    .eq('id', songId)
    .maybeSingle();
  if (songErr && songErr.code !== '42P01') {
    return NextResponse.json({ error: songErr.message }, { status: 500 });
  }
  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }
  const songRow = song as SongRow;

  const { data: existingVideos, error: vidErr } = await admin
    .from('song_videos')
    .select('video_id, song_id, variant')
    .or(`song_id.eq.${songId},video_id.eq.${videoId}`);
  if (vidErr && vidErr.code !== '42P01') {
    return NextResponse.json({ error: vidErr.message }, { status: 500 });
  }
  const rows = (existingVideos ?? []) as { video_id: string; song_id: string; variant: string | null }[];
  const onThisSong = rows.filter((r) => r.song_id === songId);
  const alreadyOnThisSong = onThisSong.some((r) => r.video_id === videoId);
  const otherLink = rows.find((r) => r.video_id === videoId && r.song_id !== songId) ?? null;

  const snippet = await getVideoSnippet(videoId, { source: 'admin-song-alternate-pv' });
  const oembed = snippet ? null : await fetchOEmbed(videoId);
  const ytTitle = (snippet?.title ?? oembed?.title ?? '').trim();
  const author = (snippet?.channelTitle ?? oembed?.author_name ?? '').trim();
  const parsed = ytTitle
    ? getArtistAndSong(ytTitle, author || null, {
        videoDescription: snippet?.description ?? null,
      })
    : null;

  const match = matchAlternatePvToExistingSong({
    existingArtist: songRow.main_artist ?? '',
    existingTitle: songRow.song_title ?? '',
    incomingArtist: parsed?.artist ?? parsed?.artistDisplay ?? author,
    incomingTitle: parsed?.song ?? null,
    incomingYoutubeTitle: ytTitle || null,
    incomingDescription: snippet?.description ?? null,
    incomingChannelId: snippet?.channelId ?? null,
  });
  const suggestedVariant =
    variantOverride || inferSongVideoVariantFromTitle(ytTitle) || 'official';

  const preview = {
    videoId,
    youtubeTitle: ytTitle || null,
    resolvedArtist: parsed?.artistDisplay ?? parsed?.artist ?? (author || null),
    resolvedTitle: parsed?.song ?? null,
    channelTitle: author || null,
    publishedAt: snippet?.publishedAt ?? null,
    suggestedVariant,
    match,
    currentCount: onThisSong.length,
    maxCount: MAX_SONG_VIDEO_VARIANTS,
    alreadyOnThisSong,
    otherSongId: otherLink?.song_id ?? null,
  };

  if (action === 'preview') {
    return NextResponse.json(preview);
  }

  if (alreadyOnThisSong) {
    return NextResponse.json({ ...preview, added: false, message: 'この PV は既にこの曲に紐づいています。' });
  }
  if (otherLink) {
    return NextResponse.json(
      {
        ...preview,
        error: 'この video_id は別の曲に既に登録されています。',
      },
      { status: 409 },
    );
  }
  const cap = canAddSongVideoVariant({
    currentCount: onThisSong.length,
    alreadyOnThisSong: false,
  });
  if (!cap.ok) {
    return NextResponse.json({ ...preview, error: cap.error }, { status: 400 });
  }
  if (match.level === 'reject' && !force) {
    return NextResponse.json(
      { ...preview, error: '同一曲として弱い／除外対象です。確認のうえ force で追記できます。' },
      { status: 400 },
    );
  }
  if (match.level === 'low' && !force) {
    return NextResponse.json(
      { ...preview, error: '同一曲の確度が低いです。内容を確認して「強制追記」してください。' },
      { status: 400 },
    );
  }

  const ytPub = snippet?.publishedAt ? new Date(snippet.publishedAt).toISOString() : null;
  const payload: Record<string, unknown> = {
    song_id: songId,
    video_id: videoId,
    variant: suggestedVariant,
  };
  if (ytPub) payload.youtube_published_at = ytPub;

  let { error: upErr } = await admin.from('song_videos').upsert(payload, { onConflict: 'video_id' });
  if (upErr?.code === '42703') {
    const r = await admin.from('song_videos').upsert(
      { song_id: songId, video_id: videoId, variant: suggestedVariant },
      { onConflict: 'video_id' },
    );
    upErr = r.error;
  }
  if (upErr) {
    return NextResponse.json({ ...preview, error: upErr.message }, { status: 500 });
  }

  // 既存 PV の variant が空／雑な既定なら YouTube タイトルから補完（Visualizer 等）
  const backfilledVariants: { videoId: string; from: string | null; to: string }[] = [];
  for (const row of onThisSong) {
    if (row.video_id === videoId) continue;
    try {
      const sib = await getVideoSnippet(row.video_id, { source: 'admin-song-alternate-pv-backfill' });
      const sibTitle = (sib?.title ?? '').trim();
      const inferred = inferSongVideoVariantFromTitle(sibTitle);
      if (!inferred || !shouldBackfillSongVideoVariant(row.variant, inferred)) continue;
      const { error: bfErr } = await admin
        .from('song_videos')
        .update({ variant: inferred })
        .eq('video_id', row.video_id)
        .eq('song_id', songId);
      if (!bfErr) {
        backfilledVariants.push({
          videoId: row.video_id,
          from: row.variant,
          to: inferred,
        });
      }
    } catch (e) {
      console.warn('[admin/song-alternate-pv] sibling variant backfill', row.video_id, e);
    }
  }

  const backfillNote =
    backfilledVariants.length > 0
      ? ` 既存 PV の variant も補完しました（${backfilledVariants
          .map((b) => `${b.videoId}→${b.to}`)
          .join(', ')}）。`
      : '';

  return NextResponse.json({
    ...preview,
    added: true,
    backfilledVariants,
    message: `別バージョンとして追記しました（variant: ${suggestedVariant}）。${backfillNote}`.trim(),
  });
}
