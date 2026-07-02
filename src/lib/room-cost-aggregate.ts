/**
 * 部屋単位・主催者単位の原価集計（Gemini + YouTube API + 選曲 + チャット）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminUserDisplayLabels } from '@/lib/admin-user-display-labels';
import type { GeminiBillingLogRow } from '@/lib/admin-user-billing-aggregate';
import {
  addGeminiLogToSummary,
  emptyGeminiUsageSummary,
  type GeminiUsageTokenSummary,
} from '@/lib/gemini-pricing';
import type { GeminiUsageBillingKind } from '@/lib/gemini-usage-attribution';
import {
  attributeYoutubeLogToOwner,
  loadGatheringsForBillingWindow,
} from '@/lib/room-owner-for-billing';
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

type RoomBucket = {
  room_id: string;
  owner_user_id: string | null;
  songs: number;
  chatUser: number;
  chatAi: number;
  gemini: GeminiUsageTokenSummary;
  byBilling: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>;
  youtube_api: YoutubeApiSlotStats;
};

function emptyBillingKindMap(): Record<GeminiUsageBillingKind, GeminiUsageTokenSummary> {
  return {
    participant_user: emptyGeminiUsageSummary(),
    guest_enjoy_owner_paid: emptyGeminiUsageSummary(),
    room_owner: emptyGeminiUsageSummary(),
    ai_agent: emptyGeminiUsageSummary(),
  };
}

function getRoomBucket(map: Map<string, RoomBucket>, roomId: string): RoomBucket {
  let b = map.get(roomId);
  if (!b) {
    b = {
      room_id: roomId,
      owner_user_id: null,
      songs: 0,
      chatUser: 0,
      chatAi: 0,
      gemini: emptyGeminiUsageSummary(),
      byBilling: emptyBillingKindMap(),
      youtube_api: emptyYoutubeApiSlotStats(),
    };
    map.set(roomId, b);
  }
  return b;
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

export type RoomCostSummaryRow = {
  room_id: string;
  owner_user_id: string | null;
  owner_display_name: string;
  song_count_total: number;
  chat_user_messages: number;
  chat_ai_messages: number;
  gemini: GeminiUsageTokenSummary;
  gemini_by_billing_kind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  youtube_api: YoutubeApiCostSummary;
  ably: AblyCostEstimate;
  total_cost_jpy_approx: number;
};

export type OwnerCostSummaryRow = {
  owner_user_id: string;
  owner_display_name: string;
  room_count: number;
  room_ids: string[];
  song_count_total: number;
  gemini: GeminiUsageTokenSummary;
  youtube_api: YoutubeApiCostSummary;
  ably: AblyCostEstimate;
  total_cost_jpy_approx: number;
};

const GEMINI_SELECT =
  'room_id, context, model, prompt_token_count, output_token_count, billing_kind, billing_user_id, user_id, trigger_user_id, created_at';

function bucketToRoomRow(b: RoomBucket, ownerLabel: string): RoomCostSummaryRow {
  const billingOut: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>> = {};
  for (const [k, v] of Object.entries(b.byBilling) as [GeminiUsageBillingKind, GeminiUsageTokenSummary][]) {
    if (v.calls > 0) billingOut[k] = v;
  }
  const youtube_api = enrichYoutubeApiStats(b.youtube_api);
  const ably = estimateAblyCost(b.chatUser, b.chatAi);
  return {
    room_id: b.room_id,
    owner_user_id: b.owner_user_id,
    owner_display_name: ownerLabel,
    song_count_total: b.songs,
    chat_user_messages: b.chatUser,
    chat_ai_messages: b.chatAi,
    gemini: b.gemini,
    gemini_by_billing_kind: billingOut,
    youtube_api,
    ably,
    total_cost_jpy_approx: b.gemini.costJpyApprox + youtube_api.costJpyApprox + ably.costJpyApprox,
  };
}

function roomHasActivity(b: RoomBucket): boolean {
  return b.gemini.calls > 0 || b.songs > 0 || b.chatUser > 0 || b.youtube_api.calls > 0;
}

export async function aggregateRoomCostSummaries(
  admin: SupabaseClient,
  options: {
    lookbackDays?: number;
    /** 指定時は lookbackDays より優先（月次予算など） */
    fromIso?: string | null;
    roomId?: string | null;
    ownerUserId?: string | null;
    nowMs?: number;
  } = {},
): Promise<{ rooms: RoomCostSummaryRow[]; owners: OwnerCostSummaryRow[] }> {
  const nowMs = options.nowMs ?? Date.now();
  const lookbackDays = Math.min(90, Math.max(1, options.lookbackDays ?? 30));
  const fromIsoExplicit = options.fromIso?.trim() || '';
  const fromIso = fromIsoExplicit
    ? fromIsoExplicit
    : new Date(nowMs - lookbackDays * 86400000).toISOString();
  const roomFilter = options.roomId?.trim() || '';
  const ownerFilter = options.ownerUserId?.trim() || '';

  const gatherings = await loadGatheringsForBillingWindow(admin, fromIso);
  const roomMap = new Map<string, RoomBucket>();

  const resolveOwner = (roomId: string, iso: string): string | null =>
    attributeYoutubeLogToOwner(gatherings, roomId, iso);

  let geminiQuery = admin.from('gemini_usage_logs').select(GEMINI_SELECT).gte('created_at', fromIso).limit(15000);
  if (roomFilter) geminiQuery = geminiQuery.eq('room_id', roomFilter);

  const { data: geminiRows, error: geminiErr } = await geminiQuery;
  if (!geminiErr || geminiErr.code === '42703') {
    const rows = geminiErr?.code === '42703' ? [] : ((geminiRows ?? []) as GeminiBillingLogRow[]);
    for (const raw of rows) {
      const roomId = raw.room_id?.trim();
      if (!roomId) continue;
      const b = getRoomBucket(roomMap, roomId);
      if (!b.owner_user_id) b.owner_user_id = resolveOwner(roomId, raw.created_at);
      addGeminiLogToSummary(b.gemini, raw);
      addBillingKind(b.byBilling, raw.billing_kind, raw);
    }
  } else if (geminiErr.code !== '42P01') {
    throw new Error(geminiErr.message);
  }

  let playQuery = admin
    .from('room_playback_history')
    .select('room_id, played_at, user_id')
    .gte('played_at', fromIso)
    .limit(10000);
  if (roomFilter) playQuery = playQuery.eq('room_id', roomFilter);

  const { data: playRows } = await playQuery;
  for (const raw of playRows ?? []) {
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    if (!roomId) continue;
    const b = getRoomBucket(roomMap, roomId);
    b.songs += 1;
    if (!b.owner_user_id && typeof raw.played_at === 'string') {
      b.owner_user_id = resolveOwner(roomId, raw.played_at);
    }
  }

  let chatQuery = admin
    .from('room_chat_log')
    .select('room_id, message_type, created_at')
    .gte('created_at', fromIso)
    .limit(8000);
  if (roomFilter) chatQuery = chatQuery.eq('room_id', roomFilter);

  const { data: chatRows } = await chatQuery;
  for (const raw of chatRows ?? []) {
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    if (!roomId) continue;
    const b = getRoomBucket(roomMap, roomId);
    const mt = (typeof raw.message_type === 'string' ? raw.message_type : '').toLowerCase();
    if (mt === 'user') b.chatUser += 1;
    else if (mt === 'ai') b.chatAi += 1;
    if (!b.owner_user_id && typeof raw.created_at === 'string') {
      b.owner_user_id = resolveOwner(roomId, raw.created_at);
    }
  }

  let ytQuery = admin
    .from('youtube_api_usage_logs')
    .select('room_id, endpoint, ok, created_at')
    .gte('created_at', fromIso)
    .limit(8000);
  if (roomFilter) ytQuery = ytQuery.eq('room_id', roomFilter);

  const { data: ytRows, error: ytErr } = await ytQuery;
  if (!ytErr) {
    for (const raw of ytRows ?? []) {
      const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
      if (!roomId) continue;
      const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
      const b = getRoomBucket(roomMap, roomId);
      addYoutubeApiLogToStats(b.youtube_api, {
        endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : null,
        ok: typeof raw.ok === 'boolean' ? raw.ok : null,
      });
      if (!b.owner_user_id && createdAt) {
        b.owner_user_id = resolveOwner(roomId, createdAt);
      }
    }
  }

  for (const b of roomMap.values()) {
    if (!b.owner_user_id && gatherings.length > 0) {
      const g = gatherings.find((x) => x.room_id?.trim() === b.room_id);
      b.owner_user_id = g?.created_by?.trim() || null;
    }
  }

  const ownerIds = Array.from(
    new Set(
      Array.from(roomMap.values())
        .map((b) => b.owner_user_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  );
  const ownerLabels = await resolveAdminUserDisplayLabels(admin, ownerIds);

  let rooms = Array.from(roomMap.values())
    .filter(roomHasActivity)
    .map((b) => {
      const label = b.owner_user_id
        ? ownerLabels.get(b.owner_user_id) ?? b.owner_user_id.slice(0, 8) + '…'
        : '（主催者不明）';
      return bucketToRoomRow(b, label);
    })
    .sort((a, b) => b.gemini.costJpyApprox - a.gemini.costJpyApprox || a.room_id.localeCompare(b.room_id));

  if (ownerFilter) {
    rooms = rooms.filter((r) => r.owner_user_id === ownerFilter);
  }

  const ownerMap = new Map<string, OwnerCostSummaryRow>();
  for (const row of rooms) {
    const oid = row.owner_user_id;
    if (!oid) continue;
    let o = ownerMap.get(oid);
    if (!o) {
      o = {
        owner_user_id: oid,
        owner_display_name: row.owner_display_name,
        room_count: 0,
        room_ids: [],
        song_count_total: 0,
        gemini: emptyGeminiUsageSummary(),
        youtube_api: enrichYoutubeApiStats(emptyYoutubeApiSlotStats()),
        ably: estimateAblyCost(0, 0),
        total_cost_jpy_approx: 0,
      };
      ownerMap.set(oid, o);
    }
    if (!o.room_ids.includes(row.room_id)) {
      o.room_ids.push(row.room_id);
      o.room_count += 1;
    }
    o.song_count_total += row.song_count_total;
    o.gemini.calls += row.gemini.calls;
    o.gemini.promptTokens += row.gemini.promptTokens;
    o.gemini.outputTokens += row.gemini.outputTokens;
    o.gemini.costUsd += row.gemini.costUsd;
    o.gemini.costJpyApprox += row.gemini.costJpyApprox;
    o.youtube_api.calls += row.youtube_api.calls;
    o.youtube_api.okCalls += row.youtube_api.okCalls;
    o.youtube_api.searchCalls += row.youtube_api.searchCalls;
    o.youtube_api.videosCalls += row.youtube_api.videosCalls;
    o.youtube_api.quotaUnits += row.youtube_api.quotaUnits;
    o.youtube_api.costJpyApprox += row.youtube_api.costJpyApprox;
    o.ably.messagesEstimated += row.ably.messagesEstimated;
    o.ably.costJpyApprox += row.ably.costJpyApprox;
    o.total_cost_jpy_approx += row.total_cost_jpy_approx;
  }

  const owners = Array.from(ownerMap.values()).sort(
    (a, b) => b.gemini.costJpyApprox - a.gemini.costJpyApprox,
  );

  return { rooms, owners };
}
