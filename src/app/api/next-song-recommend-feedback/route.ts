import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let body: {
    recommendationId?: string;
    isUpvote?: boolean;
    comment?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const recommendationId =
    typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : '';
  if (!recommendationId || !UUID_RE.test(recommendationId)) {
    return NextResponse.json({ error: 'recommendationId が無効です。' }, { status: 400 });
  }
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const hasVote = typeof body?.isUpvote === 'boolean';
  if (!hasVote && !comment) {
    return NextResponse.json({ error: 'isUpvote または comment が必要です。' }, { status: 400 });
  }
  const admin = createAdminClient() ?? supabase;
  const { data: rec, error: recErr } = await admin
    .from('next_song_recommendations')
    .select('id, seed_song_id, seed_video_id, recommended_artist, recommended_title, reason')
    .eq('id', recommendationId)
    .eq('is_active', true)
    .maybeSingle();
  if (recErr) {
    if (recErr.code === '42P01') {
      return NextResponse.json({ error: 'next_song_recommendations テーブルがありません。' }, { status: 503 });
    }
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }
  if (!rec?.id) {
    return NextResponse.json({ error: '対象のおすすめが見つかりません。' }, { status: 404 });
  }

  const commentBody = `${rec.recommended_artist}「${rec.recommended_title}」\n${rec.reason}`.slice(0, 1800);
  const row: Record<string, unknown> = {
    song_id: rec.seed_song_id ?? null,
    video_id: rec.seed_video_id ?? null,
    ai_message_id: rec.id,
    body: commentBody,
    source: 'next_song_recommend',
    is_upvote: hasVote ? body.isUpvote === true : false,
    user_id: user?.id ?? null,
    is_ambiguous: false,
    is_dubious: false,
    is_duplicate: false,
    free_comment: comment || null,
  };
  const { error } = await supabase.from('comment_feedback').insert(row);
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'comment_feedback テーブルがありません。' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

