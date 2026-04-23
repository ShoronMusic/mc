import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const limit = Math.min(
    500,
    Math.max(1, parseInt(new URL(request.url).searchParams.get('limit') || '200', 10) || 200),
  );
  const { data: rows, error } = await admin
    .from('ai_commentary_unavailable_entries')
    .select(
      'id, recorded_at, user_id, room_id, video_id, watch_url, artist_label, song_label, source, resolved, resolved_at, created_at',
    )
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'ai_commentary_unavailable_entries テーブルがありません。',
          hint: 'docs/supabase-setup.md の追補 SQL を実行してください。',
          rows: [],
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: Array.isArray(rows) ? rows : [] });
}

export async function PATCH(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  let body: { id?: string; resolved?: boolean };
  try {
    body = (await request.json()) as { id?: string; resolved?: boolean };
  } catch {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }
  if (typeof body.resolved !== 'boolean') {
    return NextResponse.json({ error: 'resolved は真偽値で指定してください。' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('ai_commentary_unavailable_entries')
    .update({
      resolved: body.resolved,
      resolved_at: body.resolved ? now : null,
    })
    .eq('id', id)
    .select('id, resolved, resolved_at')
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'テーブルがありません。' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '対象が見つかりません。' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, row: data });
}
