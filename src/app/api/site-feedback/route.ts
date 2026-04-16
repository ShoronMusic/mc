import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSiteFeedbackEmail } from '@/lib/send-feedback-email';

export const dynamic = 'force-dynamic';

const MAX_COMMENT = 2000;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'サービスが利用できません。' }, { status: 503 });
  }

  let body: {
    rating?: unknown;
    painPoints?: unknown;
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
  const allowedPainPoints = new Set([
    '入室方法',
    'YouTube URL貼り付け',
    'AIへの質問方法',
    '画面の見方',
    '特になし',
  ]);
  const painPoints =
    Array.isArray(body.painPoints) && body.painPoints.length > 0
      ? body.painPoints
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => v.length > 0 && allowedPainPoints.has(v))
          .slice(0, 5)
      : null;

  const roomId =
    typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim().slice(0, 64) : null;
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 80)
      : null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'サーバー設定が不足しています（SUPABASE_SERVICE_ROLE_KEY）。' },
      { status: 503 }
    );
  }

  const row = {
    rating,
    pain_points: painPoints && painPoints.length > 0 ? painPoints : null,
    comment,
    room_id: roomId,
    display_name: displayName,
    is_guest: !userId,
    user_id: userId,
  };

  let { error } = await admin.from('site_feedback').insert(row);
  if (error?.code === 'PGRST204' || error?.code === '42703') {
    // 旧スキーマ（pain_points 未追加）でもまずは保存できるように後方互換で再試行
    const fallbackRow = {
      rating,
      comment,
      room_id: roomId,
      display_name: displayName,
      is_guest: !userId,
      user_id: userId,
    };
    const retry = await admin.from('site_feedback').insert(fallbackRow);
    error = retry.error;
  }

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

  const emailResult = await sendSiteFeedbackEmail({
    rating,
    comment,
    roomId,
    displayName,
    isGuest: !userId,
    userId,
  });
  if (!emailResult.ok) {
    console.error('[site-feedback] Email send failed:', emailResult.error);
  }

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.ok,
    ...(emailResult.ok ? {} : { emailFailCode: emailResult.code }),
  });
}
