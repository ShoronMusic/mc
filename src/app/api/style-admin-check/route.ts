import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStyleAdminUserIds } from '@/lib/style-admin';

export const dynamic = 'force-dynamic';

/** 現在のセッションが視聴履歴スタイル変更できるか（UI 用） */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ canEdit: false });
  }
  const adminIds = getStyleAdminUserIds();
  if (adminIds.length === 0) {
    return NextResponse.json({ canEdit: true });
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ canEdit: false });
  }
  return NextResponse.json({ canEdit: adminIds.includes(uid) });
}
