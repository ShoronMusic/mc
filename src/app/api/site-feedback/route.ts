import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_COMMENT = 2000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'サービスが利用できません。' }, { status: 503 });
  }

  let body: {
    rating?: unknown;
    comment?: unknown;
    roomId?: unknown;
    displayName?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ratingRaw = body.rating;
  const rating =
    typeof ratingRaw === 'number' && Number.isInteger(ratingRaw) ? ratingRaw : Number.NaN;
  if (![-2, -1, 0, 1, 2].includes(rating)) {
    return NextResponse.json({ error: '評価は -2 〜 2 の整数で指定してください。' }, { status: 400 });
  }

  let comment: string | null = null;
  if (typeof body.comment === 'string' && body.comment.trim()) {
    comment = body.comment.trim().slice(0, MAX_COMMENT);
  }

  const roomId =
    typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim().slice(0, 64) : null;
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 80)
      : null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'サーバー設定が不足しています（SUPABASE_SERVICE_ROLE_KEY）。' },
      { status: 503 }
    );
  }

  const row = {
    rating,
    comment,
    room_id: roomId,
    display_name: displayName,
    is_guest: !userId,
    user_id: userId,
  };

  const { error } = await admin.from('site_feedback').insert(row);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'site_feedback テーブルがありません。',
          hint: 'docs/supabase-setup.md の「12. サイト全体ご意見（site_feedback）」の SQL を実行してください。',
        },
        { status: 503 }
      );
    }
    console.error('[site-feedback POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
