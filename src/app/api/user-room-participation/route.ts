import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function safeRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * GET: ログインユーザーの参加履歴
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ items: [] as unknown[] });
  }

  const { data, error } = await supabase
    .from('user_room_participation_history')
    .select('id, room_id, gathering_id, gathering_title, joined_at, left_at')
    .order('joined_at', { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            '参加履歴テーブルがありません。docs/supabase-setup.md の「参加履歴（マイページ）」の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[user-room-participation GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST body: { action: 'join' | 'leave', roomId: string }
 * - join: 未終了の同一 room + gathering の行がなければ1件作成
 * - leave: 直近の未終了行を終了
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: { action?: string; roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  const roomId = safeRoomId(body?.roomId);
  if (!roomId) {
    return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
  }

  if (action === 'join') {
    const { data: live } = await supabase
      .from('room_gatherings')
      .select('id, title')
      .eq('room_id', roomId)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const gatheringId = typeof live?.id === 'string' ? live.id : null;
    const gatheringTitle = typeof live?.title === 'string' ? live.title : null;

    const { data: openRows, error: openErr } = await supabase
      .from('user_room_participation_history')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('room_id', roomId)
      .is('left_at', null)
      .eq('gathering_id', gatheringId)
      .limit(1);

    if (openErr && openErr.code !== '42P01') {
      console.error('[user-room-participation join] open check', openErr);
    }
    if (openErr?.code === '42P01') {
      return NextResponse.json(
        {
          error:
            '参加履歴テーブルがありません。docs/supabase-setup.md の「参加履歴（マイページ）」の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    if (openRows?.length) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { error: insErr } = await supabase.from('user_room_participation_history').insert({
      user_id: session.user.id,
      room_id: roomId,
      gathering_id: gatheringId,
      gathering_title: gatheringTitle,
      joined_at: new Date().toISOString(),
      left_at: null,
    });

    if (insErr) {
      if (insErr.code === '42P01') {
        return NextResponse.json(
          {
            error:
              '参加履歴テーブルがありません。docs/supabase-setup.md の「参加履歴（マイページ）」の SQL を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[user-room-participation join] insert', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'leave') {
    const { data: openRows, error: selErr } = await supabase
      .from('user_room_participation_history')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('room_id', roomId)
      .is('left_at', null)
      .order('joined_at', { ascending: false })
      .limit(1);

    if (selErr) {
      if (selErr.code === '42P01') {
        return NextResponse.json(
          {
            error:
              '参加履歴テーブルがありません。docs/supabase-setup.md の「参加履歴（マイページ）」の SQL を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[user-room-participation leave] select', selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    const targetId = openRows?.[0]?.id;
    if (!targetId) return NextResponse.json({ ok: true, skipped: true });

    const { error: updErr } = await supabase
      .from('user_room_participation_history')
      .update({ left_at: new Date().toISOString() })
      .eq('id', targetId);

    if (updErr) {
      console.error('[user-room-participation leave] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'action は join か leave を指定してください。' }, { status: 400 });
}
