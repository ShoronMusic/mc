import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';
const MAX_ROOM_ID_LEN = 48;
const MAX_DISPLAY_NAME = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function todayJstYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > MAX_ROOM_ID_LEN) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

function safeGatheringId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > 80) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(t)) return null;
  return t;
}

/**
 * POST: 部屋入室を 1 暦日（JST）1 行まで記録（dedupe_key 一意）。
 * Body: { roomId, displayName?, isGuest?, visitorKey? (guest 必須・UUID), gatheringId? }
 * ログイン中はサーバの user を優先し is_guest=false。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: {
    roomId?: string;
    displayName?: string;
    isGuest?: boolean;
    visitorKey?: string;
    gatheringId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body?.roomId === 'string' ? safeRoomId(body.roomId) : null;
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is invalid' }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sessionUserId = user?.id ?? null;
  const isGuest = sessionUserId ? false : Boolean(body?.isGuest);

  const displayRaw = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  const display_name = displayRaw.slice(0, MAX_DISPLAY_NAME) || 'ゲスト';

  const ymd = todayJstYmd();
  let dedupe_key: string;
  if (sessionUserId) {
    dedupe_key = `${roomId}|u:${sessionUserId}|${ymd}`;
  } else {
    const vk =
      typeof body?.visitorKey === 'string' ? body.visitorKey.trim().toLowerCase() : '';
    if (!UUID_RE.test(vk)) {
      return NextResponse.json(
        { error: 'visitorKey（UUID）が必要です（ゲスト入室の重複防止用）。' },
        { status: 400 },
      );
    }
    dedupe_key = `${roomId}|g:${vk}|${ymd}`;
  }

  const gathering_id = safeGatheringId(body?.gatheringId ?? null);

  const row = {
    room_id: roomId,
    gathering_id,
    dedupe_key,
    display_name,
    is_guest: isGuest,
    user_id: sessionUserId,
  };

  const { error } = await supabase.from('room_access_log').insert(row);

  if (!error) {
    return NextResponse.json({ ok: true, duplicate: false });
  }

  if (error.code === '23505') {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (error.code === '42P01') {
    return NextResponse.json(
      {
        error: 'room_access_log テーブルがありません。',
        hint: 'docs/supabase-room-access-log-table.md の SQL を実行してください。',
      },
      { status: 503 },
    );
  }

  console.error('[room-access-log POST]', error);
  return NextResponse.json({ error: error.message }, { status: 500 });
}
