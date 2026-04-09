import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeJoinGreetingVariant,
  joinGreetingVariantToResponse,
  type JoinGreetingRow,
} from '@/lib/join-greeting-logic';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 120;

/**
 * ログインユーザーの参加履歴から入室挨拶用バリアントを返す（ゲストは none）。
 * GET ?roomId=（roomId は将来の部屋別拡張用。現状は全室の履歴で集計）
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = typeof searchParams.get('roomId') === 'string' ? searchParams.get('roomId')!.trim() : '';
    if (!roomId || roomId.length > 48) {
      return NextResponse.json({ error: 'roomId が必要です。' }, { status: 400 });
    }

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ variant: 'none', daysSinceLastVisit: null });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ variant: 'none', daysSinceLastVisit: null });
    }

    const { data, error } = await supabase
      .from('user_room_participation_history')
      .select('joined_at, left_at, room_id')
      .eq('user_id', session.user.id)
      .order('joined_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ variant: 'none', daysSinceLastVisit: null });
      }
      console.error('[api/user/join-greeting]', error);
      return NextResponse.json({ variant: 'none', daysSinceLastVisit: null });
    }

    const rows = (data ?? []) as JoinGreetingRow[];
    const v = computeJoinGreetingVariant(rows);
    return NextResponse.json(joinGreetingVariantToResponse(v));
  } catch (e) {
    console.error('[api/user/join-greeting]', e);
    return NextResponse.json({ variant: 'none', daysSinceLastVisit: null });
  }
}
