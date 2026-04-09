import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { USER_AI_TASTE_SUMMARY_MAX_CHARS } from '@/lib/user-ai-taste-summary';

export const dynamic = 'force-dynamic';

function normalizeSummaryText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\r\n/g, '\n').trim();
  if (t.length > USER_AI_TASTE_SUMMARY_MAX_CHARS) {
    return t.slice(0, USER_AI_TASTE_SUMMARY_MAX_CHARS);
  }
  return t;
}

/**
 * GET: 自分の趣向メモ（未設定は空文字）
 * PUT: { summaryText: string } で upsert
 */
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data, error } = await supabase
      .from('user_ai_taste_summary')
      .select('summary_text')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'user_ai_taste_summary テーブルがありません。docs/supabase-setup.md の手順で作成してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/ai-taste-summary GET]', error);
      return NextResponse.json({ error: 'Failed to load.' }, { status: 500 });
    }
    const summaryText = typeof data?.summary_text === 'string' ? data.summary_text : '';
    return NextResponse.json({ summaryText });
  } catch (e) {
    console.error('[api/user/ai-taste-summary GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { summaryText?: unknown } | null;
    const summaryText = normalizeSummaryText(body?.summaryText);
    if (summaryText === null) {
      return NextResponse.json({ error: 'summaryText は文字列で指定してください。' }, { status: 400 });
    }
    const { error } = await supabase.from('user_ai_taste_summary').upsert(
      {
        user_id: user.id,
        summary_text: summaryText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'user_ai_taste_summary テーブルがありません。docs/supabase-setup.md を参照してください。',
          },
          { status: 503 },
        );
      }
      console.error('[api/user/ai-taste-summary PUT]', error);
      return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, summaryText });
  } catch (e) {
    console.error('[api/user/ai-taste-summary PUT]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
