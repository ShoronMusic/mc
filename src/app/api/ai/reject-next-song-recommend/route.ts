import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTidbitModerator } from '@/lib/tidbit-moderator';
import { softDeleteNextSongRecommendById } from '@/lib/next-song-recommend-store';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** モデレーターのみ。next_song_recommendations を is_active=false にする。 */
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

  let body: { recommendationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const recommendationId =
    typeof body?.recommendationId === 'string' ? body.recommendationId.trim() : '';
  if (!recommendationId || !UUID_RE.test(recommendationId)) {
    return NextResponse.json({ error: 'recommendationId が無効です。' }, { status: 400 });
  }

  const ok = await softDeleteNextSongRecommendById(createAdminClient() ?? supabase, recommendationId);
  if (!ok) {
    return NextResponse.json({ error: '該当するおすすめが見つかりません。' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: recommendationId });
}

