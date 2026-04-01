import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type LiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle: string;
};

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

async function lobbyDisplayTitleByRoomIds(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  roomIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (roomIds.length === 0) return map;
  const { data, error } = await supabase
    .from('room_lobby_message')
    .select('room_id, display_title')
    .in('room_id', roomIds);
  if (error) {
    if (error.code === '42P01') return map;
    if (error.message?.includes('display_title') || error.code === '42703') return map;
    console.error('[room-live-status] room_lobby_message', error);
    return map;
  }
  for (const row of data ?? []) {
    const rid = typeof (row as { room_id?: string }).room_id === 'string' ? (row as { room_id: string }).room_id : '';
    const dt =
      row && typeof (row as { display_title?: unknown }).display_title === 'string'
        ? String((row as { display_title: string }).display_title).trim()
        : '';
    if (rid) map.set(rid, dt);
  }
  return map;
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

  const baseRooms: LiveRoom[] = (data ?? []).map((r) => ({
    roomId: String(r.room_id ?? ''),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'タイトル未設定の会',
    startedAt: typeof r.started_at === 'string' ? r.started_at : null,
    displayTitle: '',
  }));

  const lobbyMap = await lobbyDisplayTitleByRoomIds(
    supabase,
    baseRooms.map((r) => r.roomId).filter(Boolean),
  );
  const rooms: LiveRoom[] = baseRooms.map((r) => ({
    ...r,
    displayTitle: lobbyMap.get(r.roomId) ?? '',
  }));

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData?.session?.user?.id ?? '';

  if (roomId) {
    const first = rooms[0];
    let isOrganizer = false;
    if (sessionUserId && first) {
      const admin = createAdminClient();
      if (admin) {
        const { data: orgRow } = await admin
          .from('room_gatherings')
          .select('id')
          .eq('room_id', roomId)
          .eq('status', 'live')
          .eq('created_by', sessionUserId)
          .maybeSingle();
        isOrganizer = !!orgRow;
      }
    }
    return NextResponse.json(
      {
        configured: true,
        room: first
          ? {
              roomId: first.roomId,
              title: first.title,
              startedAt: first.startedAt,
              isLive: true,
              displayTitle: first.displayTitle,
              isOrganizer,
            }
          : {
              roomId,
              title: null,
              startedAt: null,
              isLive: false,
              displayTitle: '',
              isOrganizer: false,
            },
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
