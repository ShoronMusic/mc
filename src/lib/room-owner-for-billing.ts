/**
 * 課金帰属用: room_id × 時刻 → 主催者 user_id（room_gatherings.created_by）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runAdminHistoryQueryScoped,
  type AdminProductFilter,
} from '@/lib/room-history-product';

export type GatheringOwnerRow = {
  room_id: string;
  created_by: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
};

export function resolveOwnerUserIdAtTime(
  gatherings: GatheringOwnerRow[],
  roomId: string,
  iso: string,
): string | null {
  const rid = roomId.trim();
  if (!rid) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;

  let fallback: string | null = null;
  let fallbackStart = -Infinity;

  for (const g of gatherings) {
    if (g.room_id?.trim() !== rid) continue;
    const owner = g.created_by?.trim() || null;
    if (!owner) continue;

    const startMs = g.started_at ? new Date(g.started_at).getTime() : NaN;
    if (Number.isFinite(startMs) && startMs > fallbackStart) {
      fallback = owner;
      fallbackStart = startMs;
    }

    if (!Number.isFinite(startMs) || ms < startMs) continue;

    const endMs = g.ended_at ? new Date(g.ended_at).getTime() : NaN;
    const live = (g.status ?? '').toLowerCase() === 'live';
    if (live || !Number.isFinite(endMs) || ms <= endMs) {
      return owner;
    }
  }

  return fallback;
}

export async function loadGatheringsForBillingWindow(
  admin: SupabaseClient,
  fromIso: string,
  productFilter: AdminProductFilter = 'all',
): Promise<GatheringOwnerRow[]> {
  const scanRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('room_gatherings')
      .select('room_id, created_by, started_at, ended_at, status')
      .or(`started_at.gte.${fromIso},ended_at.gte.${fromIso},status.eq.live`)
      .order('started_at', { ascending: false })
      .limit(500);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data, error } = scanRes;

  if (error?.code === '42P01') return [];
  if (error) {
    console.error('[room-owner-for-billing] load gatherings', error.message);
    return [];
  }
  return (data ?? []) as GatheringOwnerRow[];
}

export function attributeYoutubeLogToOwner(
  gatherings: GatheringOwnerRow[],
  roomId: string | null | undefined,
  createdAt: string,
): string | null {
  const rid = roomId?.trim();
  if (!rid) return null;
  return resolveOwnerUserIdAtTime(gatherings, rid, createdAt);
}
