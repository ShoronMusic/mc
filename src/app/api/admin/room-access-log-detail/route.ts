import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 8000;

function jstDayRangeUtc(ymd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const start = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * STYLE_ADMIN。指定 JST 暦日・部屋の入室ログ明細（最大 8000 件）。
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
      { status: 403 },
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
          'ログインが確認できません。マイページからログインしてから管理画面を開き直してください。',
        hint: authError?.message,
      },
      { status: 403 },
    );
  }
  if (!adminIds.includes(uid)) {
    return NextResponse.json(
      { error: 'このアカウントは STYLE_ADMIN_USER_IDS に含まれていません。' },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const roomId = safeRoomId(searchParams.get('roomId') ?? '');
  const dateJst = (searchParams.get('date') ?? '').trim();
  if (!roomId) {
    return NextResponse.json({ error: 'roomId が必要です。' }, { status: 400 });
  }
  const range = jstDayRangeUtc(dateJst);
  if (!range) {
    return NextResponse.json({ error: 'date は YYYY-MM-DD（JST の暦日）で指定してください。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('room_access_log')
    .select('accessed_at, display_name, is_guest, user_id')
    .eq('room_id', roomId)
    .gte('accessed_at', range.startIso)
    .lt('accessed_at', range.endIso)
    .order('accessed_at', { ascending: true })
    .limit(MAX_ROWS + 1);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'room_access_log テーブルがありません。',
          hint: 'docs/supabase-room-access-log-table.md の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[admin/room-access-log-detail]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (data ?? []) as {
    accessed_at: string;
    display_name: string;
    is_guest: boolean;
    user_id: string | null;
  }[];
  const truncated = list.length > MAX_ROWS;
  const rows = truncated ? list.slice(0, MAX_ROWS) : list;

  return NextResponse.json({
    roomId,
    date_jst: dateJst,
    rows,
    truncated,
    maxRows: MAX_ROWS,
  });
}
