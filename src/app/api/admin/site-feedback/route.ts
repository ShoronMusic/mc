import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const limit = Math.min(500, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') || '100', 10) || 100));
  const offset = Math.max(0, parseInt(new URL(request.url).searchParams.get('offset') || '0', 10) || 0);

  const { data, error, count } = await admin
    .from('site_feedback')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'site_feedback テーブルがありません。',
          hint: 'docs/supabase-setup.md の「12. サイト全体ご意見（site_feedback）」の SQL を実行してください。',
          rows: [],
          total: 0,
        },
        { status: 503 }
      );
    }
    console.error('[admin/site-feedback GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: typeof count === 'number' ? count : (data ?? []).length,
  });
}
