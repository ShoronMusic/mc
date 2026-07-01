/**
 * 部屋の live 会（room_gatherings）参照 — ログ帰属・スナップショット用
 */

import { createAdminClient } from '@/lib/supabase/admin';

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

  const { data, error } = await admin
    .from('room_gatherings')
    .select('id, created_by, title')
    .eq('room_id', rid)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code !== '42P01') {
      console.error('[room-live-gathering] fetch live', error.message);
    }
    return null;
  }
  if (!data || typeof data.id !== 'string') return null;
  const createdBy =
    typeof (data as { created_by?: unknown }).created_by === 'string'
      ? (data as { created_by: string }).created_by
      : null;
  const title =
    typeof (data as { title?: unknown }).title === 'string'
      ? (data as { title: string }).title
      : null;
  return { id: data.id, createdBy, title };
}
