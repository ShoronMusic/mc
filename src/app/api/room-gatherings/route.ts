import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 120;

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * POST body:
 * - { action: 'start', roomId: string, title?: string } … 会を live で開始
 * - { action: 'end', roomId: string } … 当該ルームの live を ended にする
 *
 * ログインユーザーのみ。RLS で拒否される場合は Supabase 側ポリシーを要確認。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: { action?: string; roomId?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  const roomId = safeRoomId(typeof body?.roomId === 'string' ? body.roomId : '');
  if (!roomId) {
    return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
  }

  if (action === 'start') {
    let title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length > TITLE_MAX) {
      title = title.slice(0, TITLE_MAX);
    }
    if (!title) {
      title = '未設定の会';
    }

    const { data: existing, error: selErr } = await supabase
      .from('room_gatherings')
      .select('id')
      .eq('room_id', roomId)
      .eq('status', 'live')
      .limit(1);

    if (selErr) {
      if (selErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      console.error('[room-gatherings start] select', selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (existing?.length) {
      return NextResponse.json(
        { error: 'このルームではすでに開催中の会があります。' },
        { status: 409 },
      );
    }

    const { data: inserted, error: insErr } = await supabase
      .from('room_gatherings')
      .insert({
        room_id: roomId,
        title,
        status: 'live',
        started_at: new Date().toISOString(),
        created_by: session.user.id,
      })
      .select('id, room_id, title, started_at')
      .maybeSingle();

    if (insErr) {
      if (insErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      console.error('[room-gatherings start] insert', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, gathering: inserted });
  }

  if (action === 'end') {
    const { data: updated, error: updErr } = await supabase
      .from('room_gatherings')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('status', 'live')
      .select('id');

    if (updErr) {
      if (updErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      console.error('[room-gatherings end] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    if (!updated?.length) {
      return NextResponse.json({ error: '開催中の会がありません。' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, endedCount: updated.length });
  }

  return NextResponse.json({ error: 'action は start または end を指定してください。' }, { status: 400 });
}
