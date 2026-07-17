import type { SupabaseClient } from '@supabase/supabase-js';
import {
  countAblyPresenceForRoom,
  endStaleLiveGatheringIfNeeded,
  endStaleLiveGatheringWithoutWatch,
} from '@/lib/stale-live-gathering';

export type CronSweepResult = {
  checkedRooms: number;
  endedRooms: string[];
  skippedUnconfigured: boolean;
  skippedNoWatchTable: boolean;
  errors: string[];
};

export {
  clearRoomLivePresenceWatch,
  countAblyPresenceForRoom,
  getEmptyLiveGatheringThresholdMs,
} from '@/lib/stale-live-gathering';

/**
 * `room_gatherings` が live の各部屋について Ably presence を見、
 * 在室 0 が閾値を超えたら、または started_at が長期経過したら live を ended にする。
 */
export async function sweepEmptyLiveGatherings(admin: SupabaseClient): Promise<CronSweepResult> {
  const result: CronSweepResult = {
    checkedRooms: 0,
    endedRooms: [],
    skippedUnconfigured: false,
    skippedNoWatchTable: false,
    errors: [],
  };

  const { data: liveRows, error: liveErr } = await admin
    .from('room_gatherings')
    .select('room_id, started_at')
    .eq('status', 'live');

  if (liveErr) {
    if (liveErr.code === '42P01') {
      result.errors.push('room_gatherings テーブルがありません');
      return result;
    }
    result.errors.push(liveErr.message);
    return result;
  }

  const rows = (liveRows ?? [])
    .map((r) => ({
      roomId: String(r.room_id ?? '').trim(),
      startedAt: typeof r.started_at === 'string' ? r.started_at : null,
    }))
    .filter((r) => r.roomId);

  result.checkedRooms = rows.length;
  if (rows.length === 0) return result;

  const presenceResults = await Promise.all(
    rows.map(async ({ roomId }) => {
      const c = await countAblyPresenceForRoom(roomId);
      return { roomId, count: c };
    }),
  );

  const firstUnconfigured = presenceResults.find((p) => p.count === 'unconfigured');
  if (firstUnconfigured) {
    result.skippedUnconfigured = true;
    result.errors.push('ABLY_API_KEY 未設定のため在室確認できません');
    return result;
  }

  const startedAtByRoom = new Map(rows.map((r) => [r.roomId, r.startedAt]));

  for (const { roomId, count } of presenceResults) {
    if (count === 'error' || typeof count !== 'number') {
      continue;
    }

    if (count > 0) {
      const { error: upErr } = await admin.from('room_live_presence_watch').upsert(
        { room_id: roomId, last_nonempty_at: new Date().toISOString() },
        { onConflict: 'room_id' },
      );
      if (upErr) {
        if (upErr.code === '42P01') {
          result.skippedNoWatchTable = true;
          result.errors.push(
            'room_live_presence_watch がありません。docs/supabase-setup.md の 9.1 を実行してください。',
          );
          return result;
        }
        result.errors.push(`${roomId}: watch upsert: ${upErr.message}`);
      }
      continue;
    }

    const staleEnded = await endStaleLiveGatheringIfNeeded(admin, roomId, {
      presenceCount: 0,
      skipPresenceFetch: true,
    });
    if (staleEnded.ended) {
      result.endedRooms.push(roomId);
      continue;
    }

    const { data: watch, error: wErr } = await admin
      .from('room_live_presence_watch')
      .select('last_nonempty_at')
      .eq('room_id', roomId)
      .maybeSingle();

    if (wErr) {
      if (wErr.code === '42P01') {
        result.skippedNoWatchTable = true;
        result.errors.push(
          'room_live_presence_watch がありません。docs/supabase-setup.md の 9.1 を実行してください。',
        );
        return result;
      }
      result.errors.push(`${roomId}: watch select: ${wErr.message}`);
      continue;
    }

    const lastIso =
      watch && typeof (watch as { last_nonempty_at?: unknown }).last_nonempty_at === 'string'
        ? (watch as { last_nonempty_at: string }).last_nonempty_at
        : '';

    if (!lastIso) {
      const noWatchEnded = await endStaleLiveGatheringWithoutWatch(
        admin,
        roomId,
        startedAtByRoom.get(roomId) ?? null,
      );
      if (noWatchEnded.ended) {
        result.endedRooms.push(roomId);
      }
    }
  }

  return result;
}
