import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTidbitModerator } from '@/lib/tidbit-moderator';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * モデレーターのみ。song_tidbits を is_active=false にし、comment-pack 再利用から外す。
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isTidbitModerator(user)) {
    return NextResponse.json({ error: '権限がありません。' }, { status: 403 });
  }

  let body: { tidbitId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tidbitId = typeof body?.tidbitId === 'string' ? body.tidbitId.trim() : '';
  if (!tidbitId || !UUID_RE.test(tidbitId)) {
    return NextResponse.json({ error: 'tidbitId が無効です。' }, { status: 400 });
  }

  const admin = createAdminClient();
  const client = admin ?? supabase;
  const { data: updated, error } = await client
    .from('song_tidbits')
    .update({ is_active: false })
    .eq('id', tidbitId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[reject-tidbit]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated?.id) {
    return NextResponse.json({ error: '該当する豆知識が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: updated.id });
}
