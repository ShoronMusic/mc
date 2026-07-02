import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { grantAiCreditsAdmin } from '@/lib/user-ai-credits-server';

export const dynamic = 'force-dynamic';

/**
 * POST: 管理画面からクレジット手動付与（段階1・Stripe なし）
 * body: { userId, credits, note? }
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const {
    data: { user: adminUser },
  } = await gate.supabase.auth.getUser();
  if (!adminUser?.id) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  let body: { userId?: unknown; credits?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const credits = typeof body.credits === 'number' ? body.credits : parseInt(String(body.credits ?? ''), 10);
  const note = typeof body.note === 'string' ? body.note.trim() : undefined;

  if (!userId) {
    return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
  }
  if (!Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ error: 'credits は正の整数が必要です。' }, { status: 400 });
  }

  const result = await grantAiCreditsAdmin({
    targetUserId: userId,
    credits,
    note,
    grantedByUserId: adminUser.id,
  });

  if (!result.ok) {
    if (result.missingTable) {
      return NextResponse.json(
        {
          error: 'user_ai_credits テーブルが未作成です。',
          hint: 'docs/supabase-user-ai-credits-table.md',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    creditsRemaining: result.row.credits_remaining,
    creditsLifetimeGranted: result.row.credits_lifetime_granted,
  });
}
