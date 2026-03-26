import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

async function aggregateErasFromHistoryRows(
  supabase: SupabaseClient,
  rows: { video_id: string }[]
): Promise<{ counts: Record<string, number>; total: number }> {
  const total = rows.length;
  if (total === 0) return { counts: {}, total: 0 };

  const videoIds = Array.from(new Set(rows.map((r) => r.video_id).filter(Boolean)));
  const { data: eraRows, error } = await supabase
    .from('song_era')
    .select('video_id, era')
    .in('video_id', videoIds);

  if (error) {
    if (error.code === '42P01') {
      return { counts: { 未設定: total }, total };
    }
    console.error('[room-playback-era-stats] song_era', error);
    return { counts: { 未設定: total }, total };
  }

  const eraMap = new Map<string, string>();
  for (const r of eraRows ?? []) {
    if (r.video_id && typeof r.era === 'string') {
      eraMap.set(r.video_id, r.era);
    }
  }

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const raw = eraMap.get(row.video_id);
    const k = raw && String(raw).trim() ? String(raw).trim() : '未設定';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { counts, total };
}

/**
 * GET: ルームの視聴履歴＋song_era から年代件数集計（再生1行ごとにカウント）
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
      .select('video_id')
      .eq('room_id', roomId)
      .gte('played_at', since);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          { error: '視聴履歴テーブルがありません。' },
          { status: 503 }
        );
      }
      console.error('[room-playback-era-stats]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const { counts, total } = await aggregateErasFromHistoryRows(supabase, rows);
    return NextResponse.json({ mode: '24h', total, counts });
  }

  const { data, error } = await supabase
    .from('room_playback_history')
    .select('video_id')
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
    console.error('[room-playback-era-stats]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const { counts, total } = await aggregateErasFromHistoryRows(supabase, rows);
  return NextResponse.json({ mode: 'last100', total, counts });
}
