import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type LogRow = {
  id: string;
  endpoint: string;
  query_text: string | null;
  video_id: string | null;
  max_results: number | null;
  response_status: number | null;
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
  result_count: number | null;
  room_id: string | null;
  source: string | null;
  created_at: string;
};

type Aggregate = {
  calls: number;
  okCalls: number;
  ngCalls: number;
};

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
          'ログインが確認できません。マイページから Google でログインしてから、このタブで /admin/youtube-api-usage を開き直してください。',
        hint: authError?.message,
      },
      { status: 403 }
    );
  }
  if (!adminIds.includes(uid)) {
    return NextResponse.json(
      {
        error:
          'このアカウントは管理者リスト（STYLE_ADMIN_USER_IDS）に含まれていません。Supabase の User UID を .env.local に追加し、サーバーを再起動してください。',
      },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です（ログ保存・集計用）。' },
      { status: 503 }
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '7', 10) || 7));
  const roomId = (searchParams.get('roomId') || '').trim();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let query = admin
    .from('youtube_api_usage_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (roomId) {
    query = query.eq('room_id', roomId);
  }

  const { data: rows, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error:
            'テーブル youtube_api_usage_logs がありません。docs/supabase-youtube-api-usage-logs-table.md の SQL を実行してください。',
          logs: [],
          totals: { calls: 0, okCalls: 0, ngCalls: 0 },
          byEndpoint: {},
          bySource: {},
        },
        { status: 503 }
      );
    }
    console.error('[admin/youtube-api-usage]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as LogRow[];
  const byEndpoint: Record<string, Aggregate> = {};
  const bySource: Record<string, Aggregate> = {};
  const byRoom: Record<string, Aggregate> = {};
  let okCalls = 0;
  let ngCalls = 0;

  for (const r of list) {
    const endpoint = (r.endpoint || 'unknown').trim() || 'unknown';
    const source = (r.source || 'unknown').trim() || 'unknown';
    const room = (r.room_id || '-').trim() || '-';
    const ok = r.ok === true;

    if (!byEndpoint[endpoint]) byEndpoint[endpoint] = { calls: 0, okCalls: 0, ngCalls: 0 };
    if (!bySource[source]) bySource[source] = { calls: 0, okCalls: 0, ngCalls: 0 };
    if (!byRoom[room]) byRoom[room] = { calls: 0, okCalls: 0, ngCalls: 0 };

    byEndpoint[endpoint].calls += 1;
    bySource[source].calls += 1;
    byRoom[room].calls += 1;
    if (ok) {
      okCalls += 1;
      byEndpoint[endpoint].okCalls += 1;
      bySource[source].okCalls += 1;
      byRoom[room].okCalls += 1;
    } else {
      ngCalls += 1;
      byEndpoint[endpoint].ngCalls += 1;
      bySource[source].ngCalls += 1;
      byRoom[room].ngCalls += 1;
    }
  }

  return NextResponse.json({
    days,
    roomId: roomId || null,
    totals: { calls: list.length, okCalls, ngCalls },
    byEndpoint,
    bySource,
    byRoom,
    logs: list.slice(0, 400),
  });
}

