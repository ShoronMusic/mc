import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type LiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
};

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * GET /api/room-live-status
 * - Query roomId=01 : 単一ルームの live 判定
 * - Query rooms=01,02,03 : live ルーム一覧
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { configured: false, message: 'DBが利用できません。', room: null, rooms: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { searchParams } = new URL(request.url);
  const roomId = safeRoomId(searchParams.get('roomId') ?? '');
  const roomsRaw = searchParams.get('rooms') ?? '';

  let query = supabase
    .from('room_gatherings')
    .select('room_id, title, started_at')
    .eq('status', 'live')
    .order('started_at', { ascending: true });

  if (roomId) {
    query = query.eq('room_id', roomId);
  } else if (roomsRaw.trim()) {
    const ids = Array.from(
      new Set(
        roomsRaw
          .split(',')
          .map((s) => safeRoomId(s))
          .filter((x): x is string => x != null),
      ),
    ).slice(0, 24);
    if (ids.length > 0) {
      query = query.in('room_id', ids);
    }
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          configured: false,
          message:
            '会テーブルが未作成です。docs/room-live-session-spec.md の SQL セクションを実行してください。',
          room: null,
          rooms: [],
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('[room-live-status]', error);
    return NextResponse.json(
      { configured: false, message: error.message, room: null, rooms: [] },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rooms: LiveRoom[] = (data ?? []).map((r) => ({
    roomId: String(r.room_id ?? ''),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'タイトル未設定の会',
    startedAt: typeof r.started_at === 'string' ? r.started_at : null,
  }));

  if (roomId) {
    const first = rooms[0];
    return NextResponse.json(
      {
        configured: true,
        room: first
          ? { roomId: first.roomId, title: first.title, startedAt: first.startedAt, isLive: true }
          : { roomId, title: null, startedAt: null, isLive: false },
        rooms: [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { configured: true, rooms, room: null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
