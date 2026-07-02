/**
 * 登録ユーザー同士の同席「会」数（同一 gathering_id の参加履歴）。
 * RLS を避けるため service role クライアントから呼ぶ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function uniqueGatheringIds(rows: { gathering_id?: string | null }[] | null): string[] {
  const set = new Set<string>();
  for (const row of rows ?? []) {
    const id = typeof row.gathering_id === 'string' ? row.gathering_id.trim() : '';
    if (id) set.add(id);
  }
  return [...set];
}

/** 2 ユーザーが同じ gathering_id で参加した distinct 会数。テーブル未作成時は null。 */
export async function countCoAttendanceGatherings(
  admin: SupabaseClient,
  viewerUserId: string,
  targetUserId: string,
): Promise<number | null> {
  const a = viewerUserId.trim();
  const b = targetUserId.trim();
  if (!a || !b) return 0;
  if (a === b) return 0;

  const { data: viewerRows, error: viewerErr } = await admin
    .from('user_room_participation_history')
    .select('gathering_id')
    .eq('user_id', a)
    .not('gathering_id', 'is', null);

  if (viewerErr) {
    if (viewerErr.code === '42P01') return null;
    throw viewerErr;
  }

  const viewerGatheringIds = uniqueGatheringIds(viewerRows);
  if (viewerGatheringIds.length === 0) return 0;

  const { data: targetRows, error: targetErr } = await admin
    .from('user_room_participation_history')
    .select('gathering_id')
    .eq('user_id', b)
    .in('gathering_id', viewerGatheringIds);

  if (targetErr) {
    if (targetErr.code === '42P01') return null;
    throw targetErr;
  }

  return uniqueGatheringIds(targetRows).length;
}
