import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type LogRow = {
  id: string;
  room_id: string | null;
  room_title: string | null;
  picked_video_id: string | null;
  picked_artist_title: string | null;
  picked_youtube_title: string | null;
  pick_query: string | null;
  pick_reason: string | null;
  confirmation_text: string | null;
  input_comment: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }
  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return NextResponse.json(
      { error: 'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。' },
      { status: 403 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid || !adminIds.includes(uid)) {
    return NextResponse.json({ error: '管理者権限がありません。' }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const searchParams = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '7', 10) || 7));
  const roomId = (searchParams.get('roomId') || '').trim();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let query = admin
    .from('ai_character_song_pick_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (roomId) {
    query = query.eq('room_id', roomId);
  }
  const { data: rows, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'テーブル ai_character_song_pick_logs がありません。docs/supabase-ai-character-song-pick-logs-table.md の SQL を実行してください。',
          totals: { calls: 0 },
          byRoom: {},
          logs: [],
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as LogRow[];
  const byRoom: Record<string, { calls: number }> = {};
  for (const row of list) {
    const key = (row.room_title || row.room_id || '-').trim() || '-';
    if (!byRoom[key]) byRoom[key] = { calls: 0 };
    byRoom[key].calls += 1;
  }

  return NextResponse.json({
    days,
    roomId: roomId || null,
    totals: { calls: list.length },
    byRoom,
    logs: list.slice(0, 400),
  });
}
