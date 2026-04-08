import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isChatStyleAdminUserId } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

/**
 * ログインユーザーが部屋チャットの STYLE_ADMIN 専用ツールを使えるか（自分自身のみ true）。
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ chatStyleAdmin: false });
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id ?? null;
  return NextResponse.json({ chatStyleAdmin: isChatStyleAdminUserId(uid) });
}
