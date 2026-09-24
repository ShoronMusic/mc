import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { normalizeSongVideoVariant } from '@/lib/song-video-variants';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: unknown; videoId?: unknown; variant?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }
  const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: 'video_id が無効です。' }, { status: 400 });
  }
  const variant = normalizeSongVideoVariant(typeof body.variant === 'string' ? body.variant : '');
  if (!variant) {
    return NextResponse.json({ error: 'variant が無効です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('song_videos')
    .update({ variant })
    .eq('song_id', songId)
    .eq('video_id', videoId)
    .select('video_id, variant')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'この曲に紐づく動画が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, videoId, variant });
}
