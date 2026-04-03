import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';
const PAGE_SIZE = 1000;
/** 走査上限（超えた分は集計に含めず truncated を立てる） */
const MAX_SCAN = 80_000;

function toJstYmd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

type SummaryRow = { room_id: string; date_jst: string; count: number };

/**
 * STYLE_ADMIN_USER_IDS に含まれるユーザーのみ。
 * 直近 N 日の room_chat_log を走査し、(JST 日付 × 部屋) ごとの件数を返す。
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return NextResponse.json(
      {
        error:
          'STYLE_ADMIN_USER_IDS を .env.local に設定し、管理者アカウントでログインしてください。',
      },
      { status: 403 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) {
    return NextResponse.json(
      {
        error:
          'ログインが確認できません。マイページからログインしてから /admin/room-chat-log を開き直してください。',
        hint: authError?.message,
      },
      { status: 403 }
    );
  }
  if (!adminIds.includes(uid)) {
    return NextResponse.json(
      { error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 }
    );
  }

  const daysParam = new URL(request.url).searchParams.get('days');
  const days = Math.min(120, Math.max(1, parseInt(daysParam || '30', 10) || 30));
  const sinceMs = Date.now() - days * 86400000;
  const sinceIso = new Date(sinceMs).toISOString();

  const counts = new Map<string, number>();
  let scanned = 0;
  let truncated = false;
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from('room_chat_log')
      .select('room_id, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'room_chat_log テーブルがありません。',
            hint: 'docs/supabase-room-chat-log-table.md の SQL を実行してください。',
            rows: [],
          },
          { status: 503 }
        );
      }
      console.error('[admin/room-chat-log-summary]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const roomId = typeof row.room_id === 'string' ? row.room_id.trim() : '';
      const created = typeof row.created_at === 'string' ? row.created_at : '';
      if (!roomId || !created) continue;
      const ymd = toJstYmd(created);
      const key = `${ymd}\t${roomId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    scanned += batch.length;
    if (scanned >= MAX_SCAN) {
      truncated = batch.length === PAGE_SIZE;
      break;
    }
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const rows: SummaryRow[] = [];
  for (const [key, count] of Array.from(counts.entries())) {
    const [date_jst, room_id] = key.split('\t');
    if (date_jst && room_id) rows.push({ date_jst, room_id, count });
  }

  rows.sort((a, b) => {
    if (a.date_jst !== b.date_jst) return b.date_jst.localeCompare(a.date_jst);
    return a.room_id.localeCompare(b.room_id, 'ja');
  });

  return NextResponse.json({
    days,
    rows,
    scanned,
    truncated,
  });
}
