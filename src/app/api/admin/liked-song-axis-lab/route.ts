import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { runLikedSongAxisLab } from '@/lib/liked-song-axis-lab';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const q = typeof body?.q === 'string' ? body.q.trim() : '';
  if (!q) {
    return NextResponse.json({ error: '検索キー（q）が空です。' }, { status: 400 });
  }

  const {
    data: { user },
  } = await gate.supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  const reader = createAdminClient() ?? gate.supabase;
  const ran = await runLikedSongAxisLab({ supabase: reader, q, userId });
  if (!ran.ok) {
    return NextResponse.json({ error: ran.error }, { status: 422 });
  }
  return NextResponse.json(ran.result);
}
