import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

function aggregateStyles(rows: { style: string | null }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = r.style && String(r.style).trim() ? String(r.style).trim() : '未設定';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * GET: ルームの視聴履歴からスタイル件数集計
 * Query: roomId, mode = 24h | last100
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'DBが利用できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId')?.trim() ?? '';
  const mode = searchParams.get('mode')?.trim() ?? '24h';
  if (!roomId) {
    return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
  }
  if (mode !== '24h' && mode !== 'last100') {
    return NextResponse.json({ error: 'mode must be 24h or last100' }, { status: 400 });
  }

  const since = new Date(Date.now() - TWENTY_FOUR_H_MS).toISOString();

  if (mode === '24h') {
    const { data, error } = await supabase
      .from('room_playback_history')
      .select('style')
      .eq('room_id', roomId)
      .gte('played_at', since);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: '視聴履歴テーブルがありません。' },
          { status: 503 }
        );
      }
      console.error('[room-playback-style-stats]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const counts = aggregateStyles(rows);
    const total = rows.length;
    return NextResponse.json({ mode: '24h', total, counts });
  }

  const { data, error } = await supabase
    .from('room_playback_history')
    .select('style')
    .eq('room_id', roomId)
    .order('played_at', { ascending: false })
    .limit(100);

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: '視聴履歴テーブルがありません。' },
        { status: 503 }
      );
    }
    console.error('[room-playback-style-stats]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const counts = aggregateStyles(rows);
  const total = rows.length;
  return NextResponse.json({ mode: 'last100', total, counts });
}
