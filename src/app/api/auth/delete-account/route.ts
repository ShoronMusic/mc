import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * ログイン中のユーザーを Supabase Auth から完全に削除する。
 * POST のみ。サーバーでセッションを確認し、Admin API で削除。
 */
export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: '認証が利用できません。' },
      { status: 503 }
    );
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id) {
    return NextResponse.json(
      { error: 'ログインしていません。' },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'アカウント削除機能は現在利用できません。' },
      { status: 503 }
    );
  }

  const userId = user.id;
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('[delete-account]', deleteError);
    return NextResponse.json(
      { error: deleteError.message || 'アカウントの削除に失敗しました。' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
