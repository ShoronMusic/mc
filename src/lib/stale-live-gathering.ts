import Ably from 'ably';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRoomPresenceMembers } from '@/lib/room-owner-resolve-server';
import { persistRoomGatheringSnapshots } from '@/lib/room-gathering-snapshot';
import {
  isMissingProductColumnError,
  withGatheringProductEq,
} from '@/lib/room-product-scope';
import { getAblyServerApiKey } from '@/lib/ably-server-key';

/** 既定: 在室が一度でもあり、その後 0 が続いた時間がこの値を超えたら live を終了 */
const DEFAULT_EMPTY_MS = 30 * 60 * 1000;
const MIN_EMPTY_THRESHOLD_MS = 60_000;

export function getEmptyLiveGatheringThresholdMs(): number {
  const raw = process.env.EMPTY_LIVE_GATHERING_END_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= MIN_EMPTY_THRESHOLD_MS) return n;
  }
  return DEFAULT_EMPTY_MS;
}

export type AblyPresenceCountResult = number | 'unconfigured' | 'error';

export async function countAblyPresenceForRoom(roomId: string): Promise<AblyPresenceCountResult> {
  const key = getAblyServerApiKey();
  if (!key) return 'unconfigured';
  try {
    const rest = new Ably.Rest({ key });
    const members = await fetchRoomPresenceMembers(rest, roomId);
    return members.length;
  } catch (e) {
    console.error('[stale-live-gathering] presence', roomId, e);
    return 'error';
  }
}

/** 会の開始・手動終了時に watch 行を消す（次の live の誤検知防止） */
export async function clearRoomLivePresenceWatch(
  admin: SupabaseClient,
  roomId: string,
): Promise<void> {
  const { error } = await admin.from('room_live_presence_watch').delete().eq('room_id', roomId);
  if (error && error.code !== '42P01') {
    console.warn('[stale-live-gathering] clear watch', roomId, error.message);
  }
}

/** started_at からこの時間を超え、在室 0 なら stale とみなして ended にする（既定 72 時間） */
export const DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const MIN_STALE_MAX_AGE_MS = 60 * 60 * 1000;

export function getStaleLiveGatheringMaxAgeMs(): number {
  const raw = process.env.STALE_LIVE_GATHERING_MAX_AGE_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (n >= MIN_STALE_MAX_AGE_MS) return n;
  }
  return DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS;
}

export function isStartedAtOlderThanMaxAge(
  startedAt: string | null | undefined,
  maxAgeMs: number = getStaleLiveGatheringMaxAgeMs(),
  nowMs: number = Date.now(),
): boolean {
  if (!startedAt?.trim()) return false;
  const ms = new Date(startedAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms >= maxAgeMs;
}

export type StaleLiveGatheringEndReason =
  | 'stale_started_at'
  | 'empty_presence_after_nonempty'
  | 'stale_no_presence_watch';

export type EndStaleLiveGatheringResult = {
  ended: boolean;
  gatheringIds: string[];
  reason?: StaleLiveGatheringEndReason;
};

type LiveGatheringRow = {
  id: string;
  room_id: string;
  started_at: string | null;
};

async function fetchLiveGathering(
  admin: SupabaseClient,
  roomId: string,
): Promise<LiveGatheringRow | null> {
  const run = async (scopeProduct: boolean) => {
    let q = admin
      .from('room_gatherings')
      .select('id, room_id, started_at')
      .eq('room_id', roomId)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1);
    if (scopeProduct) q = withGatheringProductEq(q);
    return q.maybeSingle();
  };
  let { data, error } = await run(true);
  if (error && isMissingProductColumnError(error)) {
    ({ data, error } = await run(false));
  }
  if (error || !data || typeof data.id !== 'string') return null;
  return {
    id: data.id,
    room_id: String(data.room_id ?? roomId),
    started_at: typeof data.started_at === 'string' ? data.started_at : null,
  };
}

async function endLiveGatheringRows(
  admin: SupabaseClient,
  roomId: string,
  reason: StaleLiveGatheringEndReason,
): Promise<EndStaleLiveGatheringResult> {
  const run = async (scopeProduct: boolean) => {
    let q = admin
      .from('room_gatherings')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('status', 'live');
    if (scopeProduct) q = withGatheringProductEq(q);
    return q.select('id');
  };
  let { data: ended, error: endErr } = await run(true);
  if (endErr && isMissingProductColumnError(endErr)) {
    ({ data: ended, error: endErr } = await run(false));
  }

  if (endErr || !ended?.length) {
    return { ended: false, gatheringIds: [] };
  }

  const gatheringIds = ended
    .map((row) => String((row as { id?: string }).id ?? '').trim())
    .filter(Boolean);

  await clearRoomLivePresenceWatch(admin, roomId);

  if (gatheringIds.length > 0) {
    const snapResults = await persistRoomGatheringSnapshots(admin, gatheringIds, {
      endReason: reason,
    });
    for (const r of snapResults) {
      if (!r.ok && !('skipped' in r && r.skipped)) {
        console.error('[stale-live-gathering] snapshot', r);
      }
    }
  }

  console.info('[stale-live-gathering] auto-ended live gathering', { roomId, reason });
  return { ended: true, gatheringIds, reason };
}

/**
 * 在室 0 かつ (started_at が長期経過 / watch 上も空室が閾値超過) の live を ended にする。
 * presenceCount を省略すると Ably で在室数を取得する。
 */
export async function endStaleLiveGatheringIfNeeded(
  admin: SupabaseClient,
  roomId: string,
  options?: {
    presenceCount?: number;
    skipPresenceFetch?: boolean;
  },
): Promise<EndStaleLiveGatheringResult> {
  const rid = roomId.trim();
  if (!rid) return { ended: false, gatheringIds: [] };

  const live = await fetchLiveGathering(admin, rid);
  if (!live) return { ended: false, gatheringIds: [] };

  let presence = options?.presenceCount;
  let presenceKnownEmpty = false;
  let presenceUnavailable = false;
  if (presence === undefined && !options?.skipPresenceFetch) {
    const counted = await countAblyPresenceForRoom(rid);
    if (counted === 'unconfigured' || counted === 'error') {
      presenceUnavailable = true;
    } else {
      presence = counted;
    }
  } else if (presence === undefined && options?.skipPresenceFetch) {
    presenceUnavailable = true;
  }

  if (typeof presence === 'number' && presence > 0) {
    return { ended: false, gatheringIds: [] };
  }
  if (typeof presence === 'number' && presence === 0) {
    presenceKnownEmpty = true;
  }

  const maxAgeMs = getStaleLiveGatheringMaxAgeMs();
  const emptyThresholdMs = getEmptyLiveGatheringThresholdMs();
  const now = Date.now();

  /** 72時間超は Ably が取れなくても幽霊 live を終わらせる（再開 409 の主因） */
  if (isStartedAtOlderThanMaxAge(live.started_at, maxAgeMs, now)) {
    return endLiveGatheringRows(admin, rid, 'stale_started_at');
  }

  if (presenceUnavailable && !presenceKnownEmpty) {
    return { ended: false, gatheringIds: [] };
  }

  const { data: watch, error: wErr } = await admin
    .from('room_live_presence_watch')
    .select('last_nonempty_at')
    .eq('room_id', rid)
    .maybeSingle();

  if (wErr?.code === '42P01') {
    return { ended: false, gatheringIds: [] };
  }

  const lastIso =
    watch && typeof (watch as { last_nonempty_at?: unknown }).last_nonempty_at === 'string'
      ? (watch as { last_nonempty_at: string }).last_nonempty_at
      : '';

  if (!lastIso) {
    if (presenceKnownEmpty && isStartedAtOlderThanMaxAge(live.started_at, emptyThresholdMs, now)) {
      return endLiveGatheringRows(admin, rid, 'stale_no_presence_watch');
    }
    return { ended: false, gatheringIds: [] };
  }

  const lastMs = new Date(lastIso).getTime();
  if (!Number.isFinite(lastMs) || now - lastMs < emptyThresholdMs) {
    return { ended: false, gatheringIds: [] };
  }

  return endLiveGatheringRows(admin, rid, 'empty_presence_after_nonempty');
}

/** Cron 用: watch 行が無いが started_at が長期経過している live を終了 */
export async function endStaleLiveGatheringWithoutWatch(
  admin: SupabaseClient,
  roomId: string,
  startedAt: string | null,
): Promise<EndStaleLiveGatheringResult> {
  const rid = roomId.trim();
  if (!rid) return { ended: false, gatheringIds: [] };
  if (!isStartedAtOlderThanMaxAge(startedAt)) {
    return { ended: false, gatheringIds: [] };
  }

  const counted = await countAblyPresenceForRoom(rid);
  if (counted !== 0) {
    return { ended: false, gatheringIds: [] };
  }

  return endLiveGatheringRows(admin, rid, 'stale_no_presence_watch');
}
