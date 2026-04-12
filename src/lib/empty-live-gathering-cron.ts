import Ably from 'ably';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRoomPresenceMembers } from '@/lib/room-owner-resolve-server';

/** 既定: 在室が一度でもあり、その後 0 が続いた時間がこの値を超えたら live を終了 */
const DEFAULT_EMPTY_MS = 30 * 60 * 1000;
/** env で指定する場合の最小（ミス防止で 1 分以上） */
const MIN_THRESHOLD_MS = 60_000;

export function getEmptyLiveGatheringThresholdMs(): number {
  const raw = process.env.EMPTY_LIVE_GATHERING_END_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= MIN_THRESHOLD_MS) return n;
  }
  return DEFAULT_EMPTY_MS;
}

export type AblyPresenceCountResult = number | 'unconfigured' | 'error';

export async function countAblyPresenceForRoom(roomId: string): Promise<AblyPresenceCountResult> {
  const key = process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
  if (!key) return 'unconfigured';
  try {
    const rest = new Ably.Rest({ key });
    const members = await fetchRoomPresenceMembers(rest, roomId);
    return members.length;
  } catch (e) {
    console.error('[empty-live-gathering-cron] presence', roomId, e);
    return 'error';
  }
}

export type CronSweepResult = {
  checkedRooms: number;
  endedRooms: string[];
  skippedUnconfigured: boolean;
  skippedNoWatchTable: boolean;
  errors: string[];
};

/**
 * `room_gatherings` が live の各部屋について Ably presence を見、
 * 一度でも在室ありと記録したあと、在室 0 が閾値を超えたら live を ended にする。
 * `room_live_presence_watch` 未作成時は何も終了しない（42P01）。
 */
export async function sweepEmptyLiveGatherings(admin: SupabaseClient): Promise<CronSweepResult> {
  const thresholdMs = getEmptyLiveGatheringThresholdMs();
  const result: CronSweepResult = {
    checkedRooms: 0,
    endedRooms: [],
    skippedUnconfigured: false,
    skippedNoWatchTable: false,
    errors: [],
  };

  const { data: liveRows, error: liveErr } = await admin
    .from('room_gatherings')
    .select('room_id')
    .eq('status', 'live');

  if (liveErr) {
    if (liveErr.code === '42P01') {
      result.errors.push('room_gatherings テーブルがありません');
      return result;
    }
    result.errors.push(liveErr.message);
    return result;
  }

  const roomIds = Array.from(
    new Set((liveRows ?? []).map((r) => String(r.room_id ?? '').trim()).filter(Boolean)),
  );
  result.checkedRooms = roomIds.length;
  if (roomIds.length === 0) return result;

  const presenceResults = await Promise.all(
    roomIds.map(async (roomId) => {
      const c = await countAblyPresenceForRoom(roomId);
      return { roomId, count: c };
    }),
  );

  const firstUnconfigured = presenceResults.find((p) => p.count === 'unconfigured');
  if (firstUnconfigured) {
    result.skippedUnconfigured = true;
    result.errors.push('NEXT_PUBLIC_ABLY_API_KEY 未設定のため在室確認できません');
    return result;
  }

  const now = Date.now();

  for (const { roomId, count } of presenceResults) {
    if (count === 'error') {
      continue;
    }
    if (typeof count !== 'number') {
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
      continue;
    }

    const lastMs = new Date(lastIso).getTime();
    if (Number.isNaN(lastMs) || now - lastMs < thresholdMs) {
      continue;
    }

    const { data: ended, error: endErr } = await admin
      .from('room_gatherings')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('status', 'live')
      .select('id');

    if (endErr) {
      result.errors.push(`${roomId}: end gathering: ${endErr.message}`);
      continue;
    }
    if (!ended?.length) continue;

    result.endedRooms.push(roomId);
    const { error: delErr } = await admin.from('room_live_presence_watch').delete().eq('room_id', roomId);
    if (delErr && delErr.code !== '42P01') {
      console.error('[empty-live-gathering-cron] watch delete', roomId, delErr);
    }
    console.info('[empty-live-gathering-cron] auto-ended live gathering', { roomId });
  }

  return result;
}

/** 会の開始・手動終了時に watch 行を消す（次の live の誤検知防止） */
export async function clearRoomLivePresenceWatch(
  admin: SupabaseClient,
  roomId: string,
): Promise<void> {
  const { error } = await admin.from('room_live_presence_watch').delete().eq('room_id', roomId);
  if (error && error.code !== '42P01') {
    console.warn('[empty-live-gathering-cron] clear watch', roomId, error.message);
  }
}
