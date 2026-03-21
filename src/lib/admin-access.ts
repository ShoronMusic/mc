import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStyleAdminUserIds } from '@/lib/style-admin';

/**
 * /admin 配下の画面を開ける条件（API の STYLE_ADMIN チェックと揃える）
 * - STYLE_ADMIN_USER_IDS が空なら誰も不可（設定漏れで公開されないようにする）
 */
export function isAdminPanelConfigured(): boolean {
  return getStyleAdminUserIds().length > 0;
}

export function canUserAccessAdminPanel(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const ids = getStyleAdminUserIds();
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

type SupabaseServer = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/**
 * /api/admin/* の先頭で呼ぶ。未ログイン 401・非管理者 403・リスト未設定 403。
 */
export async function requireStyleAdminApi(): Promise<
  { ok: true; supabase: SupabaseServer } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 }),
    };
  }

  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'STYLE_ADMIN_USER_IDS が未設定のため管理 API を利用できません。',
        },
        { status: 403 }
      ),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 }),
    };
  }

  if (!adminIds.includes(user.id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'このアカウントには管理 API の権限がありません。' }, { status: 403 }),
    };
  }

  return { ok: true, supabase };
}
