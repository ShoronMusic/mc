import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 120;
const CREATED_ROOMS_LIMIT = 200;
const DEFAULT_ROOM_COUNT = 90;
const DEFAULT_ROOM_IDS = Array.from({ length: DEFAULT_ROOM_COUNT }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);

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
 * - { action: 'rename', roomId: string, title: string } … 当該ルームの live タイトルを更新
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

  let body: { action?: string; roomId?: string; title?: string; autoAssign?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  const requestedRoomId = safeRoomId(typeof body?.roomId === 'string' ? body.roomId : '');
  const autoAssign = body?.autoAssign === true;

  if (action === 'start') {
    let roomId = requestedRoomId;
    let title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length > TITLE_MAX) {
      title = title.slice(0, TITLE_MAX);
    }
    if (!title) {
      title = '未設定の会';
    }

    if (!roomId && autoAssign) {
      const { data: liveRows, error: liveErr } = await supabase
        .from('room_gatherings')
        .select('room_id')
        .eq('status', 'live')
        .in('room_id', DEFAULT_ROOM_IDS);
      if (liveErr) {
        if (liveErr.code === '42P01') {
          return NextResponse.json(
            { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
            { status: 503 },
          );
        }
        console.error('[room-gatherings start] select live rooms', liveErr);
        return NextResponse.json({ error: liveErr.message }, { status: 500 });
      }
      const liveSet = new Set(
        (liveRows ?? [])
          .map((r) => safeRoomId(String(r.room_id ?? '')))
          .filter((id): id is string => !!id),
      );
      roomId = DEFAULT_ROOM_IDS.find((id) => !liveSet.has(id)) ?? null;
      if (!roomId) {
        return NextResponse.json({ error: '空きルームがありません。しばらくしてから再度お試しください。' }, { status: 409 });
      }
    }
    if (!roomId) {
      return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
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
    const roomId = requestedRoomId;
    if (!roomId) {
      return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
    }
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

  if (action === 'rename') {
    const roomId = requestedRoomId;
    if (!roomId) {
      return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
    }
    let title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length > TITLE_MAX) {
      title = title.slice(0, TITLE_MAX);
    }
    if (!title) {
      return NextResponse.json({ error: 'title を入力してください。' }, { status: 400 });
    }

    const { data: updated, error: updErr } = await supabase
      .from('room_gatherings')
      .update({ title })
      .eq('room_id', roomId)
      .eq('status', 'live')
      .select('id, room_id, title')
      .limit(1);

    if (updErr) {
      if (updErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      console.error('[room-gatherings rename] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated?.length) {
      return NextResponse.json({ error: '開催中の会がありません。' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, gathering: updated[0] });
  }

  return NextResponse.json({ error: 'action は start / end / rename を指定してください。' }, { status: 400 });
}

/**
 * GET /api/room-gatherings
 * ログインユーザーが過去に主催したルーム候補を返す
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('room_gatherings')
    .select('room_id, title, status, started_at')
    .eq('created_by', session.user.id)
    .order('started_at', { ascending: false })
    .limit(CREATED_ROOMS_LIMIT);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
        { status: 503 },
      );
    }
    console.error('[room-gatherings get] select', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const map = new Map<string, { roomId: string; title: string; isLive: boolean; lastStartedAt: string | null }>();
  for (const row of data ?? []) {
    const roomId = safeRoomId(String(row.room_id ?? ''));
    if (!roomId) continue;
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : '未設定の会';
    const startedAt = typeof row.started_at === 'string' ? row.started_at : null;
    const isLive = String(row.status ?? '') === 'live';
    const prev = map.get(roomId);
    if (!prev) {
      map.set(roomId, { roomId, title, isLive, lastStartedAt: startedAt });
      continue;
    }
    map.set(roomId, {
      roomId,
      title: prev.title || title,
      isLive: prev.isLive || isLive,
      lastStartedAt: prev.lastStartedAt ?? startedAt,
    });
  }

  const rooms = Array.from(map.values());
  return NextResponse.json({ ok: true, rooms });
}
