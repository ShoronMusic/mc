/**
 * 管理画面向け: ユーザー別課金帰属集計（Gemini 中心）
 * billing_user_id を請求先キーとする（未設定時は trigger / user_id にフォールバック）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminUserDisplayLabels } from '@/lib/admin-user-display-labels';
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
import { dailySlotKey, dailySlotStartMs, formatDailySlotLabel } from '@/lib/room-daily-slot';
import {
  attributeYoutubeLogToOwner,
  loadGatheringsForBillingWindow,
} from '@/lib/room-owner-for-billing';
import {
  parseAdminProductFilter,
  runAdminHistoryQueryScoped,
  type AdminProductFilter,
} from '@/lib/room-history-product';
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

export type GeminiBillingLogRow = {
  room_id: string | null;
  context: string;
  model: string | null;
  prompt_token_count: number | null;
  output_token_count: number | null;
  billing_kind: string | null;
  billing_user_id: string | null;
  user_id: string | null;
  trigger_user_id: string | null;
  created_at: string;
};

export function resolveLogBillingUserId(log: GeminiBillingLogRow): string | null {
  return (
    log.billing_user_id?.trim() ||
    log.trigger_user_id?.trim() ||
    log.user_id?.trim() ||
    null
  );
}

export function resolveLogTriggerUserId(log: GeminiBillingLogRow): string | null {
  return log.trigger_user_id?.trim() || log.user_id?.trim() || null;
}

type UserBillingBucket = {
  userId: string;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingKind: Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>;
  songCount: number;
  roomIds: Set<string>;
  slotKeys: Set<string>;
  /** 操作者≠請求先の Gemini（主に guest_enjoy_owner_paid） */
  triggeredForOthers: GeminiUsageTokenSummary;
  /** 主催部屋の YouTube API（オーナー帰属） */
  youtube_api: YoutubeApiSlotStats;
  /** 主催部屋のチャット（Ably 推定用） */
  chatUser: number;
  chatAi: number;
};

function emptyBillingKindMap(): Record<GeminiUsageBillingKind, GeminiUsageTokenSummary> {
  return {
    participant_user: emptyGeminiUsageSummary(),
    guest_enjoy_owner_paid: emptyGeminiUsageSummary(),
    room_owner: emptyGeminiUsageSummary(),
    ai_agent: emptyGeminiUsageSummary(),
  };
}

function getUserBucket(map: Map<string, UserBillingBucket>, userId: string): UserBillingBucket {
  let b = map.get(userId);
  if (!b) {
    b = {
      userId,
      gemini: emptyGeminiUsageSummary(),
      byCategory: emptyGeminiUsageByCategory(),
      byBillingKind: emptyBillingKindMap(),
      songCount: 0,
      roomIds: new Set(),
      slotKeys: new Set(),
      triggeredForOthers: emptyGeminiUsageSummary(),
      youtube_api: emptyYoutubeApiSlotStats(),
      chatUser: 0,
      chatAi: 0,
    };
    map.set(userId, b);
  }
  return b;
}

function addBillingKindToUser(
  b: UserBillingBucket,
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
  addGeminiLogToSummary(b.byBillingKind[key], log);
}

export function ingestGeminiLogIntoUserBuckets(
  map: Map<string, UserBillingBucket>,
  log: GeminiBillingLogRow,
): void {
  const billingUid = resolveLogBillingUserId(log);
  if (!billingUid) return;

  const b = getUserBucket(map, billingUid);
  addGeminiLogToSummary(b.gemini, log);
  const cat = geminiUsageCategoryForContext(log.context);
  addGeminiLogToSummary(b.byCategory[cat], log);
  addBillingKindToUser(b, log.billing_kind, log);

  const roomId = log.room_id?.trim();
  if (roomId) {
    b.roomIds.add(roomId);
    const slotStart = dailySlotStartMs(new Date(log.created_at));
    b.slotKeys.add(dailySlotKey(roomId, slotStart));
  }

  const triggerUid = resolveLogTriggerUserId(log);
  if (triggerUid && triggerUid !== billingUid) {
    addGeminiLogToSummary(b.triggeredForOthers, log);
  }
}

export type UserBillingSummaryRow = {
  userId: string;
  displayName: string;
  songCount: number;
  roomCount: number;
  slotCount: number;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingKind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  /** 請求先が自分だが操作者は他人（ゲスト選曲→主催者負担など） */
  guestOrOtherTriggeredGemini: GeminiUsageTokenSummary;
  youtube_api: YoutubeApiCostSummary;
  ably: AblyCostEstimate;
  total_cost_jpy_approx: number;
};

export type UserBillingSlotRow = {
  slotKey: string;
  slotLabel: string;
  room_id: string;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  songCount: number;
};

function bucketToSummaryRow(
  b: UserBillingBucket,
  displayName: string,
): UserBillingSummaryRow {
  const billingOut: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>> = {};
  for (const [k, v] of Object.entries(b.byBillingKind) as [GeminiUsageBillingKind, GeminiUsageTokenSummary][]) {
    if (v.calls > 0) billingOut[k] = v;
  }
  const youtube_api = enrichYoutubeApiStats(b.youtube_api);
  const ably = estimateAblyCost(b.chatUser, b.chatAi);
  return {
    userId: b.userId,
    displayName,
    songCount: b.songCount,
    roomCount: b.roomIds.size,
    slotCount: b.slotKeys.size,
    gemini: b.gemini,
    byCategory: b.byCategory,
    byBillingKind: billingOut,
    guestOrOtherTriggeredGemini: b.triggeredForOthers,
    youtube_api,
    ably,
    total_cost_jpy_approx: b.gemini.costJpyApprox + youtube_api.costJpyApprox + ably.costJpyApprox,
  };
}

const GEMINI_SELECT =
  'room_id, context, model, prompt_token_count, output_token_count, billing_kind, billing_user_id, user_id, trigger_user_id, created_at';

async function ingestYoutubeApiToOwnerBuckets(
  admin: SupabaseClient,
  buckets: Map<string, UserBillingBucket>,
  fromIso: string,
  roomFilter: string,
  productFilter: AdminProductFilter = 'all',
): Promise<void> {
  const gatherings = await loadGatheringsForBillingWindow(admin, fromIso, productFilter);
  const scanRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('youtube_api_usage_logs')
      .select('room_id, endpoint, ok, created_at')
      .gte('created_at', fromIso)
      .limit(8000);
    if (roomFilter) q = q.eq('room_id', roomFilter);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data, error } = scanRes;
  if (error?.code === '42P01') return;
  if (error) {
    console.error('[admin-user-billing] youtube_api', error.message);
    return;
  }

  for (const raw of data ?? []) {
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
    if (!roomId || !createdAt) continue;
    const ownerId = attributeYoutubeLogToOwner(gatherings, roomId, createdAt);
    if (!ownerId) continue;
    const b = getUserBucket(buckets, ownerId);
    addYoutubeApiLogToStats(b.youtube_api, {
      endpoint: typeof raw.endpoint === 'string' ? raw.endpoint : null,
      ok: typeof raw.ok === 'boolean' ? raw.ok : null,
    });
    b.roomIds.add(roomId);
  }
}

async function ingestChatLogsToOwnerBuckets(
  admin: SupabaseClient,
  buckets: Map<string, UserBillingBucket>,
  fromIso: string,
  roomFilter: string,
  productFilter: AdminProductFilter = 'all',
): Promise<void> {
  const gatherings = await loadGatheringsForBillingWindow(admin, fromIso, productFilter);
  const scanRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('room_chat_log')
      .select('room_id, message_type, created_at')
      .gte('created_at', fromIso)
      .limit(8000);
    if (roomFilter) q = q.eq('room_id', roomFilter);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data, error } = scanRes;
  if (error?.code === '42P01') return;
  if (error) {
    console.error('[admin-user-billing] room_chat_log', error.message);
    return;
  }

  for (const raw of data ?? []) {
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    const createdAt = typeof raw.created_at === 'string' ? raw.created_at : '';
    if (!roomId || !createdAt) continue;
    const ownerId = attributeYoutubeLogToOwner(gatherings, roomId, createdAt);
    if (!ownerId) continue;
    const b = getUserBucket(buckets, ownerId);
    const mt = (typeof raw.message_type === 'string' ? raw.message_type : '').toLowerCase();
    if (mt === 'user') b.chatUser += 1;
    else if (mt === 'ai') b.chatAi += 1;
    b.roomIds.add(roomId);
  }
}

export async function aggregateUserBillingSummaries(
  admin: SupabaseClient,
  options: {
    lookbackDays?: number;
    roomId?: string | null;
    nowMs?: number;
    productFilter?: AdminProductFilter;
  } = {},
): Promise<UserBillingSummaryRow[]> {
  const lookbackDays = Math.min(90, Math.max(1, options.lookbackDays ?? 30));
  const fromIso = new Date((options.nowMs ?? Date.now()) - lookbackDays * 86400000).toISOString();
  const roomFilter = options.roomId?.trim() || '';
  const productFilter = options.productFilter ?? parseAdminProductFilter(null);
  const buckets = new Map<string, UserBillingBucket>();

  const geminiRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin.from('gemini_usage_logs').select(GEMINI_SELECT).gte('created_at', fromIso).limit(15000);
    if (roomFilter) q = q.eq('room_id', roomFilter);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data: geminiRows, error: geminiErr } = geminiRes;
  if (geminiErr?.code === '42703') {
    const legacyRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
      let q = admin
        .from('gemini_usage_logs')
        .select('room_id, context, model, prompt_token_count, output_token_count, user_id, created_at')
        .gte('created_at', fromIso)
        .limit(15000);
      if (roomFilter) q = q.eq('room_id', roomFilter);
      if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
      return q;
    }, productFilter);
    for (const raw of legacyRes.data ?? []) {
      const row = raw as GeminiBillingLogRow;
      ingestGeminiLogIntoUserBuckets(buckets, {
        ...row,
        billing_kind: null,
        billing_user_id: null,
        trigger_user_id: row.user_id,
      });
    }
  } else if (geminiErr && geminiErr.code !== '42P01') {
    throw new Error(geminiErr.message ?? 'gemini_usage_logs query failed');
  } else {
    for (const raw of (geminiRows ?? []) as GeminiBillingLogRow[]) {
      ingestGeminiLogIntoUserBuckets(buckets, raw);
    }
  }

  const playRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('room_playback_history')
      .select('room_id, played_at, user_id')
      .gte('played_at', fromIso)
      .limit(10000);
    if (roomFilter) q = q.eq('room_id', roomFilter);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data: playRows } = playRes;
  for (const raw of playRows ?? []) {
    const uid = typeof raw.user_id === 'string' ? raw.user_id.trim() : '';
    if (!uid) continue;
    const b = getUserBucket(buckets, uid);
    b.songCount += 1;
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    if (roomId) b.roomIds.add(roomId);
  }

  await ingestYoutubeApiToOwnerBuckets(admin, buckets, fromIso, roomFilter, productFilter);
  await ingestChatLogsToOwnerBuckets(admin, buckets, fromIso, roomFilter, productFilter);

  const userIds = Array.from(buckets.keys());
  const labels = await resolveAdminUserDisplayLabels(admin, userIds);

  return Array.from(buckets.values())
    .filter(
      (b) => b.gemini.calls > 0 || b.songCount > 0 || b.youtube_api.calls > 0 || b.chatUser + b.chatAi > 0,
    )
    .map((b) => bucketToSummaryRow(b, labels.get(b.userId) ?? b.userId.slice(0, 8) + '…'))
    .sort((a, b) => b.gemini.costJpyApprox - a.gemini.costJpyApprox);
}

export async function aggregateUserBillingDetail(
  admin: SupabaseClient,
  userId: string,
  options: { lookbackDays?: number; nowMs?: number; productFilter?: AdminProductFilter } = {},
): Promise<{ summary: UserBillingSummaryRow | null; slots: UserBillingSlotRow[] }> {
  const uid = userId.trim();
  if (!uid) return { summary: null, slots: [] };

  const lookbackDays = Math.min(90, Math.max(1, options.lookbackDays ?? 30));
  const fromIso = new Date((options.nowMs ?? Date.now()) - lookbackDays * 86400000).toISOString();
  const productFilter = options.productFilter ?? parseAdminProductFilter(null);
  const mainBucket = getUserBucket(new Map(), uid);
  const slotBuckets = new Map<string, UserBillingBucket>();

  const geminiRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('gemini_usage_logs')
      .select(GEMINI_SELECT)
      .gte('created_at', fromIso)
      .or(`billing_user_id.eq.${uid},trigger_user_id.eq.${uid},user_id.eq.${uid}`)
      .limit(8000);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data: geminiRows, error: geminiErr } = geminiRes;
  if (geminiErr && geminiErr.code !== '42P01' && geminiErr.code !== '42703') {
    throw new Error(geminiErr.message ?? 'gemini_usage_logs query failed');
  }

  for (const raw of (geminiRows ?? []) as GeminiBillingLogRow[]) {
    const billingUid = resolveLogBillingUserId(raw);
    if (billingUid !== uid) continue;
    ingestGeminiLogIntoUserBuckets(new Map([[uid, mainBucket]]), raw);

    const roomId = raw.room_id?.trim();
    if (!roomId) continue;
    const slotStart = dailySlotStartMs(new Date(raw.created_at));
    const sk = dailySlotKey(roomId, slotStart);
    const slotB = getUserBucket(slotBuckets, sk);
    slotB.userId = sk;
    addGeminiLogToSummary(slotB.gemini, raw);
    const cat = geminiUsageCategoryForContext(raw.context);
    addGeminiLogToSummary(slotB.byCategory[cat], raw);
    if (!slotB.roomIds.has(roomId)) slotB.roomIds.add(roomId);
  }

  const playRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
    let q = admin
      .from('room_playback_history')
      .select('room_id, played_at, user_id')
      .eq('user_id', uid)
      .gte('played_at', fromIso)
      .limit(5000);
    if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
    return q;
  }, productFilter);
  const { data: playRows } = playRes;

  for (const raw of playRows ?? []) {
    mainBucket.songCount += 1;
    const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
    if (!roomId || typeof raw.played_at !== 'string') continue;
    const sk = dailySlotKey(roomId, dailySlotStartMs(new Date(raw.played_at)));
    const slotB = getUserBucket(slotBuckets, sk);
    slotB.userId = sk;
    slotB.songCount += 1;
    slotB.roomIds.add(roomId);
  }

  await ingestYoutubeApiToOwnerBuckets(admin, new Map([[uid, mainBucket]]), fromIso, '');
  await ingestChatLogsToOwnerBuckets(admin, new Map([[uid, mainBucket]]), fromIso, '');

  const labels = await resolveAdminUserDisplayLabels(admin, [uid]);
  const summary = bucketToSummaryRow(mainBucket, labels.get(uid) ?? uid.slice(0, 8) + '…');

  const slots: UserBillingSlotRow[] = Array.from(slotBuckets.values())
    .filter((b) => b.gemini.calls > 0 || b.songCount > 0)
    .map((b) => {
      const parsed = b.userId.split('::');
      const slotStartMs = Number(parsed[0]);
      const room_id = parsed.slice(1).join('::') || '—';
      return {
        slotKey: b.userId,
        slotLabel: Number.isFinite(slotStartMs) ? formatDailySlotLabel(slotStartMs) : b.userId,
        room_id,
        gemini: b.gemini,
        byCategory: b.byCategory,
        songCount: b.songCount,
      };
    })
    .sort((a, b) => b.gemini.costJpyApprox - a.gemini.costJpyApprox);

  if (
    summary.gemini.calls === 0 &&
    summary.songCount === 0 &&
    summary.youtube_api.calls === 0 &&
    summary.ably.messagesEstimated === 0
  ) {
    return { summary: null, slots: [] };
  }
  return { summary, slots };
}
