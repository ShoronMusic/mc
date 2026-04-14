import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type LiveRoom = {
  gatheringId: string;
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle: string;
  joinLocked: boolean;
  canEnter: boolean;
};

type RoomGatheringRow = {
  id: string;
  room_id: string;
  title: string | null;
  started_at: string | null;
  join_locked?: boolean | null;
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
 * - Query roomId=01 : 単一部屋の live 判定
 * - Query rooms=01,02,03 : live 部屋一覧
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

  const buildBaseQuery = (withJoinLocked: boolean) => {
    const selectCols = withJoinLocked
      ? 'id, room_id, title, started_at, join_locked'
      : 'id, room_id, title, started_at';
    return supabase
      .from('room_gatherings')
      .select(selectCols)
      .eq('status', 'live')
      .order('started_at', { ascending: true });
  };
  let query = buildBaseQuery(true);

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

  let data: RoomGatheringRow[] | null = null;
  let error: { code?: string; message?: string } | null = null;
  {
    const res = await query;
    data = (res.data as RoomGatheringRow[] | null) ?? null;
    error = res.error as { code?: string; message?: string } | null;
  }
  if (error?.code === '42703' || error?.message?.includes('join_locked')) {
    let fallback = buildBaseQuery(false);
    if (roomId) {
      fallback = fallback.eq('room_id', roomId);
    } else if (roomsRaw.trim()) {
      const ids = Array.from(
        new Set(
          roomsRaw
            .split(',')
            .map((s) => safeRoomId(s))
            .filter((x): x is string => x != null),
        ),
      ).slice(0, 24);
      if (ids.length > 0) fallback = fallback.in('room_id', ids);
    }
    const res2 = await fallback;
    data = (res2.data as RoomGatheringRow[] | null) ?? null;
    error = res2.error as { code?: string; message?: string } | null;
  }
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
    gatheringId: typeof r.id === 'string' ? r.id : '',
    roomId: String(r.room_id ?? ''),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'タイトル未設定の会',
    startedAt: typeof r.started_at === 'string' ? r.started_at : null,
    displayTitle: '',
    joinLocked: r.join_locked === true,
    canEnter: true,
  }));

  const lobbyMap = await lobbyDisplayTitleByRoomIds(
    supabase,
    baseRooms.map((r) => r.roomId).filter(Boolean),
  );
  const roomIdsLive = baseRooms.map((r) => r.roomId).filter(Boolean);
  const gatheringIdsLive = baseRooms.map((r) => r.gatheringId).filter(Boolean);

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData?.session?.user?.id ?? '';

  let organizerRoomIdSet = new Set<string>();
  if (sessionUserId && roomIdsLive.length > 0) {
    const admin = createAdminClient();
    if (admin) {
      const { data: myLiveRows, error: myLiveErr } = await admin
        .from('room_gatherings')
        .select('room_id')
        .eq('status', 'live')
        .eq('created_by', sessionUserId)
        .in('room_id', roomIdsLive);
      if (!myLiveErr) {
        organizerRoomIdSet = new Set(
          (myLiveRows ?? [])
            .map((r) => (typeof (r as { room_id?: string }).room_id === 'string' ? (r as { room_id: string }).room_id : ''))
            .filter(Boolean),
        );
      }
    }
  }

  let enteredGatheringSet = new Set<string>();
  if (sessionUserId && gatheringIdsLive.length > 0) {
    const admin = createAdminClient();
    if (admin) {
      const { data: joinedRows, error: joinedErr } = await admin
        .from('user_room_participation_history')
        .select('gathering_id')
        .eq('user_id', sessionUserId)
        .in('gathering_id', gatheringIdsLive);
      if (!joinedErr) {
        enteredGatheringSet = new Set(
          (joinedRows ?? [])
            .map((r) =>
              typeof (r as { gathering_id?: string | null }).gathering_id === 'string'
                ? (r as { gathering_id: string }).gathering_id
                : '',
            )
            .filter(Boolean),
        );
      }
    }
  }

  const rooms: LiveRoom[] = baseRooms.map((r) => {
    const isOrganizerForRoom = organizerRoomIdSet.has(r.roomId);
    const canEnter = !r.joinLocked || isOrganizerForRoom || enteredGatheringSet.has(r.gatheringId);
    return {
      ...r,
      displayTitle: lobbyMap.get(r.roomId) ?? '',
      canEnter,
    };
  });

  if (roomId) {
    const first = rooms[0];
    const isOrganizer = first ? organizerRoomIdSet.has(first.roomId) : false;
    return NextResponse.json(
      {
        configured: true,
        room: first
          ? {
              roomId: first.roomId,
              gatheringId: first.gatheringId,
              title: first.title,
              startedAt: first.startedAt,
              isLive: true,
              displayTitle: first.displayTitle,
              joinLocked: first.joinLocked,
              canEnter: first.canEnter,
              isOrganizer,
            }
          : {
              roomId,
              gatheringId: '',
              title: null,
              startedAt: null,
              isLive: false,
              displayTitle: '',
              joinLocked: false,
              canEnter: true,
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
