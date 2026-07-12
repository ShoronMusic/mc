/**
 * 部屋の live 会（room_gatherings）参照 — ログ帰属・スナップショット用
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { runGatheringQueryScoped, withGatheringProductEq } from '@/lib/room-product-scope';

export type LiveGatheringRef = {
  id: string;
  createdBy: string | null;
  title: string | null;
};

export async function fetchLiveGatheringForRoom(roomId: string): Promise<LiveGatheringRef | null> {
  const rid = roomId?.trim();
  if (!rid) return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const liveRes = await runGatheringQueryScoped((scopeProduct) => {
    let q = admin
      .from('room_gatherings')
      .select('id, created_by, title')
      .eq('room_id', rid)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1);
    if (scopeProduct) q = withGatheringProductEq(q);
    return q.maybeSingle();
  });
  const { data, error } = liveRes;

  if (error) {
    if (error.code !== '42P01') {
      console.error('[room-live-gathering] fetch live', error.message);
    }
    return null;
  }
  if (!data || typeof (data as { id?: unknown }).id !== 'string') return null;
  const row = data as { id: string; created_by?: string | null; title?: string | null };
  const createdBy = typeof row.created_by === 'string' ? row.created_by : null;
  const title = typeof row.title === 'string' ? row.title : null;
  return { id: row.id, createdBy, title };
}
