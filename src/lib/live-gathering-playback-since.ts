import type { SupabaseClient } from '@supabase/supabase-js';
import { maxIsoTimestamp } from '@/lib/playback-history-since';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/** 部屋の開催中 gathering の started_at（視聴履歴の会単位フィルタ用） */
export async function fetchLiveGatheringStartedAtIso(
  supabase: SupabaseClient,
  roomId: string,
): Promise<string | null> {
  const rid = roomId.trim();
  if (!rid) return null;

  const { data, error } = await supabase
    .from('room_gatherings')
    .select('started_at')
    .eq('room_id', rid)
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }

  const startedAt = typeof data?.started_at === 'string' ? data.started_at.trim() : '';
  return startedAt || null;
}

export function parsePlaybackHistorySinceQuery(raw: string | null): string | undefined {
  const t = raw?.trim() ?? '';
  if (!t) return undefined;
  const ms = new Date(t).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

/** 年代・スタイル分布 API 用の played_at 下限 */
export async function resolveRoomPlaybackStatsSinceIso(
  supabase: SupabaseClient,
  roomId: string,
  sinceQuery: string | undefined,
  mode: '24h' | 'last100',
): Promise<string | undefined> {
  let gatheringSince: string | null = null;
  try {
    gatheringSince = await fetchLiveGatheringStartedAtIso(supabase, roomId);
  } catch (e) {
    console.error('[live-gathering-playback-since] gathering since', e);
  }
  const windowSince =
    mode === '24h' ? new Date(Date.now() - TWENTY_FOUR_H_MS).toISOString() : undefined;
  return maxIsoTimestamp(sinceQuery, gatheringSince, windowSince);
}
