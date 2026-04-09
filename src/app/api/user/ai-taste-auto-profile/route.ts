import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET: 自分の自動趣向要約（未設定は空文字・updatedAt null）
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
      .from('user_ai_taste_auto_profile')
      .select('profile_text, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            profileText: '',
            updatedAt: null,
            tableMissing: true,
            hint: 'docs/supabase-setup.md 第 15 章の SQL を実行してください。',
          },
          { status: 200 },
        );
      }
      console.error('[api/user/ai-taste-auto-profile GET]', error);
      return NextResponse.json({ error: 'Failed to load.' }, { status: 500 });
    }

    const profileText = typeof data?.profile_text === 'string' ? data.profile_text : '';
    const updatedAt = typeof data?.updated_at === 'string' ? data.updated_at : null;

    return NextResponse.json({
      profileText,
      updatedAt,
      tableMissing: false,
    });
  } catch (e) {
    console.error('[api/user/ai-taste-auto-profile GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
