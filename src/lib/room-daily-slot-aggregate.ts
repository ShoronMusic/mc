/**
 * 部屋 × 12h スロット単位の AI・選曲・チャット集計（会終了不要）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminUserDisplayLabels } from '@/lib/admin-user-display-labels';
import {
  resolveLogBillingUserId,
  resolveLogTriggerUserId,
  type GeminiBillingLogRow,
} from '@/lib/admin-user-billing-aggregate';
import {
  addGeminiLogToSummary,
  emptyGeminiUsageSummary,
  type GeminiUsageTokenSummary,
} from '@/lib/gemini-pricing';
import type { GeminiUsageBillingKind } from '@/lib/gemini-usage-attribution';
import {
  emptyGeminiUsageByCategory,
  geminiUsageCategoryForContext,
  type GeminiUsageCategoryId,
} from '@/lib/gemini-usage-categories';
import {
  dailySlotEndMs,
  dailySlotKey,
  dailySlotStartMs,
  formatDailySlotLabel,
  isDailySlotComplete,
  isoInDailySlot,
  parseDailySlotKey,
} from '@/lib/room-daily-slot';
import {
  enrichYoutubeApiStats,
  estimateAblyCost,
  type AblyCostEstimate,
  type YoutubeApiCostSummary,
} from '@/lib/infra-cost-estimates';
import {
  addYoutubeApiLogToStats,
  emptyYoutubeApiSlotStats,
  type YoutubeApiSlotStats,
} from '@/lib/youtube-api-slot-aggregate';

type PlaybackRow = {
  room_id: string;
  played_at: string;
  user_id: string | null;
};

type ChatRow = {
  room_id: string;
  message_type: string | null;
  created_at: string;
};

type YoutubeApiRow = {
  room_id: string | null;
  endpoint: string | null;
  ok: boolean | null;
  created_at: string;
};

export type DailySlotUserBillingRow = {
  userId: string;
  displayName: string;
  songCount: number;
  /** 請求先（billing_user_id）として帰属する Gemini */
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingKind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  /** 操作者≠請求先（ゲスト選曲→主催者負担など） */
  guestOrOtherTriggeredGemini: GeminiUsageTokenSummary;
};

/** @deprecated DailySlotUserBillingRow を使用 */
export type DailySlotUserGeminiRow = DailySlotUserBillingRow;

export type DailySlotSummaryRow = {
  slotKey: string;
  slotStartMs: number;
  slotEndMs: number;
  slotLabel: string;
  room_id: string;
  slotComplete: boolean;
  song_count_total: number;
  chat_user_messages: number;
  chat_ai_messages: number;
  unique_participant_users: number;
  gemini: GeminiUsageTokenSummary;
  gemini_by_billing_kind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  gemini_by_category: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  youtube_api: YoutubeApiCostSummary;
  ably: AblyCostEstimate;
  total_cost_jpy_approx: number;
};

const GEMINI_SELECT =
  'room_id, context, model, prompt_token_count, output_token_count, billing_kind, billing_user_id, user_id, trigger_user_id, created_at';

function emptyBillingKindMap(): Record<GeminiUsageBillingKind, GeminiUsageTokenSummary> {
  return {
    participant_user: emptyGeminiUsageSummary(),
    guest_enjoy_owner_paid: emptyGeminiUsageSummary(),
    room_owner: emptyGeminiUsageSummary(),
    ai_agent: emptyGeminiUsageSummary(),
  };
}

function addBillingKind(
  map: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>,
  kind: string | null,
  log: GeminiBillingLogRow,
): void {
  const key =
    kind === 'participant_user' ||
    kind === 'guest_enjoy_owner_paid' ||
    kind === 'room_owner' ||
    kind === 'ai_agent'
      ? kind
      : 'room_owner';
  addGeminiLogToSummary(map[key], log);
}

type SlotBucket = {
  room_id: string;
  slotStartMs: number;
  songs: number;
  chatUser: number;
  chatAi: number;
  participantUsers: Set<string>;
  songCountByUser: Map<string, number>;
  gemini: GeminiUsageTokenSummary;
  byBilling: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingUser: Map<
    string,
    {
      gemini: GeminiUsageTokenSummary;
      byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
      byBillingKind: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>;
      triggeredForOthers: GeminiUsageTokenSummary;
    }
  >;
  youtubeApi: YoutubeApiSlotStats;
};

function getOrCreateBucket(
  map: Map<string, SlotBucket>,
  roomId: string,
  slotStartMs: number,
): SlotBucket {
  const key = dailySlotKey(roomId, slotStartMs);
  let b = map.get(key);
  if (!b) {
    b = {
      room_id: roomId,
      slotStartMs,
      songs: 0,
      chatUser: 0,
      chatAi: 0,
      participantUsers: new Set(),
      songCountByUser: new Map(),
      gemini: emptyGeminiUsageSummary(),
      byBilling: emptyBillingKindMap(),
      byCategory: emptyGeminiUsageByCategory(),
      byBillingUser: new Map(),
      youtubeApi: emptyYoutubeApiSlotStats(),
    };
    map.set(key, b);
  }
  return b;
}

function getUserMetrics(b: SlotBucket, userId: string) {
  let u = b.byBillingUser.get(userId);
  if (!u) {
    u = {
      gemini: emptyGeminiUsageSummary(),
      byCategory: emptyGeminiUsageByCategory(),
      byBillingKind: emptyBillingKindMap(),
      triggeredForOthers: emptyGeminiUsageSummary(),
    };
    b.byBillingUser.set(userId, u);
  }
  return u;
}

function addGeminiToBucket(b: SlotBucket, log: GeminiBillingLogRow): void {
  addGeminiLogToSummary(b.gemini, log);
  addBillingKind(b.byBilling, log.billing_kind, log);
  const cat = geminiUsageCategoryForContext(log.context);
  addGeminiLogToSummary(b.byCategory[cat], log);

  const billingUid = resolveLogBillingUserId(log);
  const triggerUid = resolveLogTriggerUserId(log);
  if (triggerUid) b.participantUsers.add(triggerUid);
  if (billingUid) b.participantUsers.add(billingUid);

  if (billingUid) {
    const u = getUserMetrics(b, billingUid);
    addGeminiLogToSummary(u.gemini, log);
    addGeminiLogToSummary(u.byCategory[cat], log);
    addBillingKind(u.byBillingKind, log.billing_kind, log);
    if (triggerUid && triggerUid !== billingUid) {
      addGeminiLogToSummary(u.triggeredForOthers, log);
    }
  }
}

function addSongToBucket(b: SlotBucket, userId: string | null | undefined): void {
  b.songs += 1;
  const uid = userId?.trim();
  if (!uid) return;
  b.participantUsers.add(uid);
  b.songCountByUser.set(uid, (b.songCountByUser.get(uid) ?? 0) + 1);
}

function bucketToRow(b: SlotBucket, nowMs: number): DailySlotSummaryRow {
  const billingOut: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>> = {};
  for (const [k, v] of Object.entries(b.byBilling) as [GeminiUsageBillingKind, GeminiUsageTokenSummary][]) {
    if (v.calls > 0) billingOut[k] = v;
  }
  const youtube_api = enrichYoutubeApiStats(b.youtubeApi);
  const ably = estimateAblyCost(b.chatUser, b.chatAi);
  return {
    slotKey: dailySlotKey(b.room_id, b.slotStartMs),
    slotStartMs: b.slotStartMs,
    slotEndMs: dailySlotEndMs(b.slotStartMs),
    slotLabel: formatDailySlotLabel(b.slotStartMs),
    room_id: b.room_id,
    slotComplete: isDailySlotComplete(b.slotStartMs, nowMs),
    song_count_total: b.songs,
    chat_user_messages: b.chatUser,
    chat_ai_messages: b.chatAi,
    unique_participant_users: b.participantUsers.size,
    gemini: b.gemini,
    gemini_by_billing_kind: billingOut,
    gemini_by_category: b.byCategory,
    youtube_api,
    ably,
    total_cost_jpy_approx: b.gemini.costJpyApprox + youtube_api.costJpyApprox + ably.costJpyApprox,
  };
}

function slotRowHasActivity(r: DailySlotSummaryRow): boolean {
  return (
    r.gemini.calls > 0 ||
    r.song_count_total > 0 ||
    r.chat_user_messages > 0 ||
    r.youtube_api.calls > 0
  );
}

async function ingestYoutubeApiLogs(
  admin: SupabaseClient,
  buckets: Map<string, SlotBucket>,
  fromIso: string,
  roomFilter: string,
  toIso?: string,
): Promise<void> {
  let query = admin
    .from('youtube_api_usage_logs')
    .select('room_id, endpoint, ok, created_at')
    .gte('created_at', fromIso)
    .limit(8000);
  if (toIso) query = query.lt('created_at', toIso);
  if (roomFilter) query = query.eq('room_id', roomFilter);

  const { data, error } = await query;
  if (error?.code === '42P01') return;
  if (error) {
    console.error('[room-daily-slot-aggregate] youtube_api', error.message);
    return;
  }

  for (const raw of (data ?? []) as YoutubeApiRow[]) {
    const roomId = raw.room_id?.trim();
    if (!roomId) continue;
    const slotStart = dailySlotStartMs(new Date(raw.created_at));
    if (toIso && !isoInDailySlot(raw.created_at, slotStart)) continue;
    addYoutubeApiLogToStats(getOrCreateBucket(buckets, roomId, slotStart).youtubeApi, raw);
  }
}

async function buildUserBillingRows(
  admin: SupabaseClient,
  b: SlotBucket,
): Promise<DailySlotUserBillingRow[]> {
  const userIds = Array.from(
    new Set([...b.byBillingUser.keys(), ...b.songCountByUser.keys()]),
  );
  const labels = await resolveAdminUserDisplayLabels(admin, userIds);

  return userIds
    .map((uid) => {
      const metrics = b.byBillingUser.get(uid);
      const billingOut: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>> = {};
      if (metrics) {
        for (const [k, v] of Object.entries(metrics.byBillingKind) as [
          GeminiUsageBillingKind,
          GeminiUsageTokenSummary,
        ][]) {
          if (v.calls > 0) billingOut[k] = v;
        }
      }
      return {
        userId: uid,
        displayName: labels.get(uid) ?? uid.slice(0, 8) + '…',
        songCount: b.songCountByUser.get(uid) ?? 0,
        gemini: metrics?.gemini ?? emptyGeminiUsageSummary(),
        byCategory: metrics?.byCategory ?? emptyGeminiUsageByCategory(),
        byBillingKind: billingOut,
        guestOrOtherTriggeredGemini: metrics?.triggeredForOthers ?? emptyGeminiUsageSummary(),
      };
    })
    .filter((u) => u.gemini.calls > 0 || u.songCount > 0)
    .sort((a, b) => b.gemini.costJpyApprox - a.gemini.costJpyApprox || b.songCount - a.songCount);
}

export async function aggregateDailySlotSummaries(
  admin: SupabaseClient,
  options: { lookbackDays?: number; roomId?: string | null; nowMs?: number } = {},
): Promise<DailySlotSummaryRow[]> {
  const lookbackDays = Math.min(90, Math.max(1, options.lookbackDays ?? 14));
  const nowMs = options.nowMs ?? Date.now();
  const fromMs = nowMs - lookbackDays * 86400000;
  const fromIso = new Date(fromMs).toISOString();
  const roomFilter = options.roomId?.trim() || '';

  const buckets = new Map<string, SlotBucket>();

  let geminiQuery = admin.from('gemini_usage_logs').select(GEMINI_SELECT).gte('created_at', fromIso).limit(12000);
  if (roomFilter) geminiQuery = geminiQuery.eq('room_id', roomFilter);

  const { data: geminiRows, error: geminiErr } = await geminiQuery;
  if (geminiErr?.code === '42703') {
    let legacyQuery = admin
      .from('gemini_usage_logs')
      .select('room_id, context, model, prompt_token_count, output_token_count, user_id, created_at')
      .gte('created_at', fromIso)
      .limit(12000);
    if (roomFilter) legacyQuery = legacyQuery.eq('room_id', roomFilter);
    const { data: legacyRows } = await legacyQuery;
    for (const raw of legacyRows ?? []) {
      const row = raw as GeminiBillingLogRow;
      const roomId = row.room_id?.trim();
      if (!roomId) continue;
      const slotStart = dailySlotStartMs(new Date(row.created_at));
      if (slotStart < fromMs - 12 * 60 * 60 * 1000) continue;
      addGeminiToBucket(getOrCreateBucket(buckets, roomId, slotStart), {
        ...row,
        billing_kind: null,
        billing_user_id: null,
        trigger_user_id: row.user_id,
      });
    }
  } else if (geminiErr && geminiErr.code !== '42P01') {
    throw new Error(geminiErr.message);
  } else {
    for (const raw of (geminiRows ?? []) as GeminiBillingLogRow[]) {
      const roomId = raw.room_id?.trim();
      if (!roomId) continue;
      const slotStart = dailySlotStartMs(new Date(raw.created_at));
      if (slotStart < fromMs - 12 * 60 * 60 * 1000) continue;
      addGeminiToBucket(getOrCreateBucket(buckets, roomId, slotStart), raw);
    }
  }

  let playQuery = admin
    .from('room_playback_history')
    .select('room_id, played_at, user_id')
    .gte('played_at', fromIso)
    .limit(8000);
  if (roomFilter) playQuery = playQuery.eq('room_id', roomFilter);

  const { data: playRows, error: playErr } = await playQuery;
  if (!playErr) {
    for (const raw of (playRows ?? []) as PlaybackRow[]) {
      const roomId = raw.room_id?.trim();
      if (!roomId) continue;
      const slotStart = dailySlotStartMs(new Date(raw.played_at));
      addSongToBucket(getOrCreateBucket(buckets, roomId, slotStart), raw.user_id);
    }
  }

  let chatQuery = admin
    .from('room_chat_log')
    .select('room_id, message_type, created_at')
    .gte('created_at', fromIso)
    .limit(8000);
  if (roomFilter) chatQuery = chatQuery.eq('room_id', roomFilter);

  const { data: chatRows, error: chatErr } = await chatQuery;
  if (!chatErr) {
    for (const raw of (chatRows ?? []) as ChatRow[]) {
      const roomId = raw.room_id?.trim();
      if (!roomId) continue;
      const slotStart = dailySlotStartMs(new Date(raw.created_at));
      const b = getOrCreateBucket(buckets, roomId, slotStart);
      const mt = (raw.message_type ?? '').toLowerCase();
      if (mt === 'user') b.chatUser += 1;
      else if (mt === 'ai') b.chatAi += 1;
    }
  }

  await ingestYoutubeApiLogs(admin, buckets, fromIso, roomFilter);

  return Array.from(buckets.values())
    .map((b) => bucketToRow(b, nowMs))
    .filter(slotRowHasActivity)
    .sort((a, b) => b.slotStartMs - a.slotStartMs || a.room_id.localeCompare(b.room_id));
}

export async function aggregateDailySlotDetail(
  admin: SupabaseClient,
  slotKey: string,
  nowMs: number = Date.now(),
): Promise<{ summary: DailySlotSummaryRow | null; users: DailySlotUserBillingRow[] }> {
  const parsed = parseDailySlotKey(slotKey);
  if (!parsed) return { summary: null, users: [] };

  const { slotStartMs, roomId } = parsed;
  const fromIso = new Date(slotStartMs).toISOString();
  const toIso = new Date(dailySlotEndMs(slotStartMs)).toISOString();
  const buckets = new Map<string, SlotBucket>();
  const b = getOrCreateBucket(buckets, roomId, slotStartMs);

  const { data: geminiRows } = await admin
    .from('gemini_usage_logs')
    .select(GEMINI_SELECT)
    .eq('room_id', roomId)
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .limit(5000);

  for (const raw of (geminiRows ?? []) as GeminiBillingLogRow[]) {
    if (!isoInDailySlot(raw.created_at, slotStartMs)) continue;
    addGeminiToBucket(b, raw);
  }

  const { data: playRows } = await admin
    .from('room_playback_history')
    .select('room_id, played_at, user_id')
    .eq('room_id', roomId)
    .gte('played_at', fromIso)
    .lt('played_at', toIso)
    .limit(3000);

  for (const raw of (playRows ?? []) as PlaybackRow[]) {
    if (!isoInDailySlot(raw.played_at, slotStartMs)) continue;
    addSongToBucket(b, raw.user_id);
  }

  const { data: chatRows } = await admin
    .from('room_chat_log')
    .select('room_id, message_type, created_at')
    .eq('room_id', roomId)
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .limit(5000);

  for (const raw of (chatRows ?? []) as ChatRow[]) {
    if (!isoInDailySlot(raw.created_at, slotStartMs)) continue;
    const mt = (raw.message_type ?? '').toLowerCase();
    if (mt === 'user') b.chatUser += 1;
    else if (mt === 'ai') b.chatAi += 1;
  }

  await ingestYoutubeApiLogs(admin, buckets, fromIso, roomId, toIso);

  const summary = bucketToRow(b, nowMs);
  if (!slotRowHasActivity(summary)) {
    return { summary: null, users: [] };
  }

  const users = await buildUserBillingRows(admin, b);
  return { summary, users };
}
