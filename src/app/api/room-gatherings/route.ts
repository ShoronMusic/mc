import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clearRoomLivePresenceWatch } from '@/lib/empty-live-gathering-cron';
import { ROOM_DISPLAY_TITLE_MAX_CHARS } from '@/lib/room-lobby-message';

export const dynamic = 'force-dynamic';

const TITLE_MAX = 120;
/** 同一ユーザーが同時に主催できる live の会の上限（部屋 ID は別々） */
const MAX_LIVE_GATHERINGS_PER_USER = 2;
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
    console.error('[room-gatherings GET] room_lobby_message', error);
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
 * POST body:
 * - { action: 'start', roomId: string, title?: string } … 開催を live で開始
 * - { action: 'end', roomId: string } … 当該部屋の live を ended にする
 * - { action: 'rename', roomId: string, title: string } … 当該部屋の live タイトルを更新
 * - { action: 'set_lock', roomId: string, locked: boolean } … 新規参加の締切（鍵）ON/OFF
 *
 * ログインユーザーのみ。RLS で拒否される場合は Supabase 側ポリシーを要確認。
 * start 時は created_by が同一で status=live の会が既に 2 件あると 409。
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

  let body: { action?: string; roomId?: string; title?: string; autoAssign?: boolean; locked?: boolean };
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
      title = '未設定の部屋';
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
        return NextResponse.json({ error: '空きの部屋がありません。しばらくしてから再度お試しください。' }, { status: 409 });
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
        { error: 'この部屋ではすでに開催中の会があります。' },
        { status: 409 },
      );
    }

    const { count: myLiveCount, error: myLiveErr } = await supabase
      .from('room_gatherings')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', session.user.id)
      .eq('status', 'live');
    if (myLiveErr) {
      if (myLiveErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      console.error('[room-gatherings start] count my live', myLiveErr);
      return NextResponse.json({ error: myLiveErr.message }, { status: 500 });
    }
    if ((myLiveCount ?? 0) >= MAX_LIVE_GATHERINGS_PER_USER) {
      return NextResponse.json(
        {
          error: `同時に主催できる会は最大${MAX_LIVE_GATHERINGS_PER_USER}部屋までです。不要な会を終了してから再度お試しください。`,
        },
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

    const adminWatch = createAdminClient();
    if (adminWatch) {
      await clearRoomLivePresenceWatch(adminWatch, roomId);
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

    const adminWatchEnd = createAdminClient();
    if (adminWatchEnd) {
      await clearRoomLivePresenceWatch(adminWatchEnd, roomId);
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
    const admin = createAdminClient();
    if (admin) {
      const lobbyTitle = title.slice(0, ROOM_DISPLAY_TITLE_MAX_CHARS);
      const { data: existingLobby } = await admin
        .from('room_lobby_message')
        .select('message')
        .eq('room_id', roomId)
        .maybeSingle();
      const existingMsg = typeof existingLobby?.message === 'string' ? existingLobby.message : '';
      const { error: lobbyErr } = await admin.from('room_lobby_message').upsert(
        {
          room_id: roomId,
          display_title: lobbyTitle,
          message: existingMsg,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id' },
      );
      if (lobbyErr) {
        console.error('[room-gatherings rename] lobby sync', lobbyErr);
      }
    }
    return NextResponse.json({ ok: true, gathering: updated[0] });
  }

  if (action === 'set_lock') {
    const roomId = requestedRoomId;
    if (!roomId) {
      return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
    }
    if (typeof body?.locked !== 'boolean') {
      return NextResponse.json({ error: 'locked は boolean を指定してください。' }, { status: 400 });
    }

    const { data: updated, error: updErr } = await supabase
      .from('room_gatherings')
      .update({ join_locked: body.locked })
      .eq('room_id', roomId)
      .eq('status', 'live')
      .select('id, room_id, join_locked')
      .limit(1);

    if (updErr) {
      if (updErr.code === '42P01') {
        return NextResponse.json(
          { error: '会テーブルがありません。docs/room-live-session-spec.md の SQL を実行してください。' },
          { status: 503 },
        );
      }
      if (updErr.code === '42703' || updErr.message?.includes('join_locked')) {
        return NextResponse.json(
          {
            error:
              '新規参加締切（鍵）機能の列が未作成です。docs/room-live-session-spec.md の追加 SQL（join_locked）を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[room-gatherings set_lock] update', updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    if (!updated?.length) {
      return NextResponse.json({ error: '開催中の会がありません。' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, roomId, joinLocked: body.locked });
  }

  return NextResponse.json({ error: 'action は start / end / rename / set_lock を指定してください。' }, { status: 400 });
}

/**
 * GET /api/room-gatherings
 * ログインユーザーが過去に主催した部屋候補を返す
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

  const lobbyMap = await lobbyDisplayTitleByRoomIds(supabase, Array.from(map.keys()));
  for (const [roomId, v] of map) {
    const dt = lobbyMap.get(roomId)?.trim() ?? '';
    if (dt) {
      map.set(roomId, { ...v, title: dt });
    }
  }

  const rooms = Array.from(map.values());
  return NextResponse.json({ ok: true, rooms });
}
