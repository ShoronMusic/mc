import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

type LogRow = {
  id: string;
  context: string;
  model: string;
  prompt_token_count: number | null;
  output_token_count: number | null;
  total_token_count: number | null;
  cached_token_count: number | null;
  room_id: string | null;
  video_id: string | null;
  created_at: string;
};

/**
 * STYLE_ADMIN_USER_IDS に含まれるログインユーザーのみ。
 * 直近 N 日のログを集計し、一覧は最大 400 件。
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

  // Route Handler では getSession() が空になることがあるため getUser()（JWT検証）を使う
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) {
    return NextResponse.json(
      {
        error:
          'ログインが確認できません。マイページから Google でログインしてから、このタブで /admin/gemini-usage を開き直してください。',
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

  const daysParam = new URL(request.url).searchParams.get('days');
  const days = Math.min(90, Math.max(1, parseInt(daysParam || '7', 10) || 7));
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data: rows, error } = await admin
    .from('gemini_usage_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'テーブル gemini_usage_logs がありません。docs/supabase-gemini-usage-logs-table.md の SQL を実行してください。',
          logs: [],
          byContext: {},
          totals: { calls: 0, promptTokens: 0, outputTokens: 0 },
        },
        { status: 503 }
      );
    }
    console.error('[admin/gemini-usage]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as LogRow[];
  let promptTokens = 0;
  let outputTokens = 0;
  const byContext: Record<string, { calls: number; promptTokens: number; outputTokens: number }> =
    {};

  for (const r of list) {
    const p = r.prompt_token_count ?? 0;
    const o = r.output_token_count ?? 0;
    promptTokens += p;
    outputTokens += o;
    const c = r.context || 'unknown';
    if (!byContext[c]) {
      byContext[c] = { calls: 0, promptTokens: 0, outputTokens: 0 };
    }
    byContext[c].calls += 1;
    byContext[c].promptTokens += p;
    byContext[c].outputTokens += o;
  }

  return NextResponse.json({
    days,
    totals: {
      calls: list.length,
      promptTokens,
      outputTokens,
    },
    byContext,
    logs: list.slice(0, 400),
  });
}
