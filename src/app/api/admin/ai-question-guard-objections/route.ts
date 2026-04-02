import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

/**
 * STYLE_ADMIN + service_role。異議申立て一覧・レビュー更新。
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const limit = Math.min(200, Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') || '80', 10) || 80));
  const offset = Math.max(0, parseInt(new URL(request.url).searchParams.get('offset') || '0', 10) || 0);

  const { data, error, count } = await admin
    .from('ai_question_guard_objections')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'ai_question_guard_objections テーブルがありません。',
          hint: 'docs/supabase-setup.md の「11. AI 質問ガード異議申立て」の SQL を実行してください。',
          rows: [],
          total: 0,
        },
        { status: 503 }
      );
    }
    console.error('[admin/ai-question-guard-objections GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: typeof count === 'number' ? count : (data ?? []).length,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { id?: string; reviewed?: boolean; adminNote?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'id が必要です。' }, { status: 400 });
  }

  const {
    data: { user },
  } = await gate.supabase.auth.getUser();
  const reviewerId = user?.id;
  if (!reviewerId) {
    return NextResponse.json({ error: 'ユーザーが取得できません。' }, { status: 401 });
  }

  const updatePayload: Record<string, unknown> = {};
  if (typeof body.reviewed === 'boolean') {
    updatePayload.reviewed_at = body.reviewed ? new Date().toISOString() : null;
    updatePayload.reviewed_by = body.reviewed ? reviewerId : null;
  }
  if (typeof body.adminNote === 'string') {
    const t = body.adminNote.trim().slice(0, 4000);
    updatePayload.admin_note = t === '' ? null : t;
  }
  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'reviewed または adminNote のいずれかが必要です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('ai_question_guard_objections')
    .update(updatePayload)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[admin/ai-question-guard-objections PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '該当行がありません。' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
