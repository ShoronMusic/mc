import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';

/** 今日の日付を JST で YYYY-MM-DD */
function todayJstYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** YYYY-MM-DD（JST の暦日）の [start, end) を ISO UTC */
function jstDayRangeUtc(ymd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatLineTime(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const MAX_BATCH = 200;
const MAX_EXPORT_ROWS = 8000;
const MAX_BODY = 2000;
const MAX_CLIENT_MSG_ID_LEN = 160;
const MAX_DISPLAY_NAME = 200;

type LogEntryIn = {
  client_message_id?: string;
  created_at?: string;
  message_type?: string;
  display_name?: string;
  body?: string;
  from_current_session_user?: boolean;
};

function safeGatheringId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  // UUID想定（将来差し替えを考慮して英数字/ハイフンのみ許可）
  if (!t || t.length > 80) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(t)) return null;
  return t;
}

type LogRow = {
  created_at: string;
  message_type: string;
  display_name: string;
  body: string;
};

/**
 * GET: 指定ルーム・指定日（JST 1日）の会話ログをプレーンテキストで返す。
 * Query: roomId（必須）, date=YYYY-MM-DD（省略時は今日 JST）, gatheringId（任意）, download=1（ファイルダウンロード）
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  if (!roomId || roomId.length > 128) {
    return NextResponse.json({ error: 'roomId が必要です' }, { status: 400 });
  }

  const dateParam = searchParams.get('date')?.trim();
  const gatheringId = safeGatheringId(searchParams.get('gatheringId'));
  const ymd = dateParam && dateParam.length > 0 ? dateParam : todayJstYmd();
  const range = jstDayRangeUtc(ymd);
  if (!range) {
    return NextResponse.json({ error: 'date は YYYY-MM-DD 形式で指定してください' }, { status: 400 });
  }

  let query = supabase
    .from('room_chat_log')
    .select('created_at, message_type, display_name, body')
    .eq('room_id', roomId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso);
  if (gatheringId) {
    query = query.eq('gathering_id', gatheringId);
  }
  const { data, error } = await query.order('created_at', { ascending: true }).limit(MAX_EXPORT_ROWS + 1);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_chat_log テーブルがありません。',
          hint: 'docs/supabase-room-chat-log-table.md の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    console.error('[room-chat-log GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as LogRow[];
  const truncated = rows.length > MAX_EXPORT_ROWS;
  const list = truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;

  const header = [
    `ルームID: ${roomId}`,
    gatheringId ? `会ID: ${gatheringId}` : null,
    `日付（JST）: ${ymd}`,
    `件数: ${list.length}${truncated ? `（上限 ${MAX_EXPORT_ROWS} 件で打ち切り）` : ''}`,
    '---',
    '',
  ].filter(Boolean).join('\n');

  const lines = list.map((r) => {
    const t = formatLineTime(r.created_at);
    const type = r.message_type ?? '?';
    const name = (r.display_name ?? '').replace(/\r?\n/g, ' ');
    const bodyOneLine = (r.body ?? '').replace(/\r?\n/g, ' ');
    return `[${t}] [${type}] ${name}: ${bodyOneLine}`;
  });

  const text = header + lines.join('\n') + (list.length > 0 ? '\n' : '');

  const download = searchParams.get('download') === '1' || searchParams.get('download') === 'true';
  const safeSlug = roomId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const filenameAscii = `chatlog-${ymd}-${safeSlug || 'room'}.txt`;

  const headers = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (download) {
    headers.set('Content-Disposition', `attachment; filename="${filenameAscii}"`);
  }

  return new NextResponse(text, { status: 200, headers });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  let body: { roomId?: string; gatheringId?: string | null; entries?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  const gatheringId = safeGatheringId(body.gatheringId);
  if (!roomId || roomId.length > 128) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }

  const raw = Array.isArray(body.entries) ? body.entries : [];
  if (raw.length === 0) {
    return NextResponse.json({ ok: true, rows: 0 });
  }
  if (raw.length > MAX_BATCH) {
    return NextResponse.json({ error: `entries は最大 ${MAX_BATCH} 件です` }, { status: 400 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionUserId = session?.user?.id ?? null;

  const rows: Array<{
    room_id: string;
    gathering_id: string | null;
    client_message_id: string;
    created_at: string;
    message_type: 'user' | 'ai' | 'system';
    display_name: string;
    body: string;
    user_id: string | null;
  }> = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as LogEntryIn;
    const client_message_id =
      typeof e.client_message_id === 'string' ? e.client_message_id.trim() : '';
    if (!client_message_id || client_message_id.length > MAX_CLIENT_MSG_ID_LEN) continue;

    const mt = e.message_type;
    if (mt !== 'user' && mt !== 'ai' && mt !== 'system') continue;

    const display_name =
      typeof e.display_name === 'string' ? e.display_name.trim().slice(0, MAX_DISPLAY_NAME) : '';
    if (!display_name) continue;

    let b = typeof e.body === 'string' ? e.body : '';
    if (b.length > MAX_BODY) b = b.slice(0, MAX_BODY);
    const trimmed = b.trim();
    if (!trimmed) continue;

    const created_at =
      typeof e.created_at === 'string' && e.created_at.trim() ? e.created_at.trim() : new Date().toISOString();

    const fromSession = Boolean(e.from_current_session_user);
    const user_id =
      fromSession && sessionUserId && mt === 'user' ? sessionUserId : null;

    rows.push({
      room_id: roomId,
      gathering_id: gatheringId,
      client_message_id,
      created_at,
      message_type: mt,
      display_name,
      body: trimmed,
      user_id,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, rows: 0 });
  }

  const { error } = await supabase.from('room_chat_log').upsert(rows, {
    onConflict: 'client_message_id',
    ignoreDuplicates: true,
  });

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_chat_log テーブルがありません。',
          hint: 'docs/supabase-room-chat-log-table.md の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    if (error.code === '42703' || error.message?.includes('gathering_id')) {
      return NextResponse.json(
        {
          error: 'room_chat_log に gathering_id カラムがありません。',
          hint: 'docs/supabase-room-chat-log-table.md の追記 SQL（gathering_id）を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[room-chat-log POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: rows.length });
}
