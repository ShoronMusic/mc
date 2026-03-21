import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isTidbitModerator } from '@/lib/tidbit-moderator';

export const dynamic = 'force-dynamic';

/** NG ボタン表示用：現在のログインユーザーが tidbit モデレーターか */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ canRejectTidbit: false });
  }
  // Route Handler では getSession() が空になることがあるため getUser()（JWT 検証）を使う
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ canRejectTidbit: isTidbitModerator(user) });
}
