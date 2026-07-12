/**
 * 会終了時: room_playback_history から gathering 単位の視聴履歴スナップショットを保存
 * SQL: docs/supabase-room-gathering-snapshots-table.md（room_gathering_playback_snapshots）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductId } from '@/lib/product-mode';
import { normalizeRoomHistoryProduct, runRoomHistoryQueryScoped, withRoomHistoryProductEq } from '@/lib/room-history-product';

export type GatheringPlaybackSnapshotResult =
  | { ok: true; inserted: number; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

type HistoryRow = {
  video_id: string;
  display_name: string;
  is_guest: boolean;
  played_at: string;
  title: string | null;
  artist_name: string | null;
  style: string | null;
  selection_round: number | null;
};

const INSERT_BATCH = 200;

export async function persistGatheringPlaybackSnapshot(
  admin: SupabaseClient,
  params: {
    gatheringId: string;
    roomId: string;
    ownerUserId: string | null;
    startedAt: string;
    endedAt: string;
    product?: ProductId | string | null;
  },
): Promise<GatheringPlaybackSnapshotResult> {
  const gatheringId = params.gatheringId.trim();
  const roomId = params.roomId.trim();
  if (!gatheringId || !roomId || !params.startedAt || !params.endedAt) {
    return { ok: true, skipped: true, reason: 'missing_window' };
  }

  const { count, error: countErr } = await admin
    .from('room_gathering_playback_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('gathering_id', gatheringId);

  if (countErr) {
    if (countErr.code === '42P01') {
      return { ok: true, skipped: true, reason: 'playback_snapshot_table_missing' };
    }
    return { ok: false, error: countErr.message };
  }
  if ((count ?? 0) > 0) {
    return { ok: true, skipped: true, reason: 'already_saved' };
  }

  const historyProduct = normalizeRoomHistoryProduct(params.product);

  const histRes = await runRoomHistoryQueryScoped((scopeProduct) => {
    let q = admin
      .from('room_playback_history')
      .select(
        'video_id, display_name, is_guest, played_at, title, artist_name, style, selection_round',
      )
      .eq('room_id', roomId)
      .gte('played_at', params.startedAt)
      .lte('played_at', params.endedAt)
      .order('played_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(5000);
    if (scopeProduct) q = withRoomHistoryProductEq(q, historyProduct);
    return q;
  });

  const { data, error: histErr } = histRes;

  if (histErr) {
    if (histErr.code === '42P01') {
      return { ok: true, skipped: true, reason: 'playback_history_missing' };
    }
    return { ok: false, error: histErr.message ?? 'query failed' };
  }

  const rows = (data ?? []) as HistoryRow[];
  if (rows.length === 0) {
    return { ok: true, inserted: 0 };
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    const payload = chunk.map((row, idx) => ({
      gathering_id: gatheringId,
      room_id: roomId,
      owner_user_id: params.ownerUserId,
      sort_order: i + idx,
      video_id: row.video_id,
      display_name: row.display_name,
      is_guest: row.is_guest,
      played_at: row.played_at,
      title: row.title,
      artist_name: row.artist_name,
      style: row.style,
      selection_round:
        typeof row.selection_round === 'number' && Number.isFinite(row.selection_round)
          ? Math.floor(row.selection_round)
          : null,
    }));

    const { error: insErr } = await admin.from('room_gathering_playback_snapshots').insert(payload);
    if (insErr) {
      if (insErr.code === '42P01') {
        return { ok: true, skipped: true, reason: 'playback_snapshot_table_missing' };
      }
      return { ok: false, error: insErr.message };
    }
    inserted += chunk.length;
  }

  return { ok: true, inserted };
}
