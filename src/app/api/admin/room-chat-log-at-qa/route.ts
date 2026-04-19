import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  attachObjectionsToAtPairs,
  buildAtChatPairsFromLogRows,
  type RoomChatLogRow,
} from '@/lib/room-chat-at-qa-from-log';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';
const MAX_ROWS = 8000;

function todayJstYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function jstDayRangeUtc(ymd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function safeGatheringId(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t.length > 80) return null;
  if (!/^[a-zA-Z0-9-]+$/.test(t)) return null;
  return t;
}

/**
 * STYLE_ADMIN。room_chat_log から @→AI のペアを JSON で返す。同日・同部屋の質問ガード異議も付ける。
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  const dateParam = searchParams.get('date')?.trim();
  const ymd = dateParam && dateParam.length > 0 ? dateParam : todayJstYmd();
  const gatheringId = safeGatheringId(searchParams.get('gatheringId'));

  if (!roomId || roomId.length > 128) {
    return NextResponse.json({ error: 'roomId が必要です' }, { status: 400 });
  }

  const range = jstDayRangeUtc(ymd);
  if (!range) {
    return NextResponse.json({ error: 'date は YYYY-MM-DD 形式で指定してください' }, { status: 400 });
  }

  let logQuery = admin
    .from('room_chat_log')
    .select('created_at, message_type, display_name, body')
    .eq('room_id', roomId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS + 1);

  if (gatheringId) {
    logQuery = logQuery.eq('gathering_id', gatheringId);
  }

  const { data: logData, error: logError } = await logQuery;

  if (logError) {
    if (logError.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_chat_log テーブルがありません。',
          hint: 'docs/supabase-room-chat-log-table.md の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    console.error('[admin/room-chat-log-at-qa] room_chat_log', logError);
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  const rawRows = (logData ?? []) as RoomChatLogRow[];
  const truncated = rawRows.length > MAX_ROWS;
  const rows = truncated ? rawRows.slice(0, MAX_ROWS) : rawRows;

  const pairs = buildAtChatPairsFromLogRows(rows);

  const { data: objData, error: objError } = await admin
    .from('ai_question_guard_objections')
    .select('id, created_at, reason_keys, free_comment, conversation_snapshot, system_message_body, reviewed_at')
    .eq('room_id', roomId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: true });

  let objections: Array<{
    id: string;
    created_at: string;
    reason_keys: string[] | null;
    free_comment: string | null;
    conversation_snapshot: unknown;
    system_message_body: string;
    reviewed_at: string | null;
  }> = [];

  if (objError) {
    if (objError.code !== '42P01') {
      console.error('[admin/room-chat-log-at-qa] objections', objError);
    }
  } else if (Array.isArray(objData)) {
    objections = objData.map((o) => ({
      id: String((o as Record<string, unknown>).id ?? ''),
      created_at: String((o as Record<string, unknown>).created_at ?? ''),
      reason_keys: (o as Record<string, unknown>).reason_keys as string[] | null,
      free_comment: (o as Record<string, unknown>).free_comment as string | null,
      conversation_snapshot: (o as Record<string, unknown>).conversation_snapshot,
      system_message_body: String((o as Record<string, unknown>).system_message_body ?? '').slice(0, 400),
      reviewed_at: ((o as Record<string, unknown>).reviewed_at as string | null) ?? null,
    }));
  }

  if (objections.length > 0) {
    attachObjectionsToAtPairs(
      pairs,
      objections.map((o) => ({
        id: o.id,
        created_at: o.created_at,
        reason_keys: o.reason_keys,
        free_comment: o.free_comment,
        conversation_snapshot: o.conversation_snapshot,
      }))
    );
  }

  return NextResponse.json({
    roomId,
    dateJst: ymd,
    gatheringId,
    truncated,
    rowCount: rows.length,
    pairCount: pairs.length,
    pairs,
    objections,
  });
}
