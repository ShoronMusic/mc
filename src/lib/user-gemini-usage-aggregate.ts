/**
 * ログインユーザー単位の Gemini 利用を参加スロット・月次に集計
 * 請求先: billing_user_id（未設定時は user_id にフォールバック）
 */

import { resolveLogBillingUserId, type GeminiBillingLogRow } from '@/lib/admin-user-billing-aggregate';
import {
  addGeminiLogToSummary,
  emptyGeminiUsageSummary,
  formatGeminiUsageMonthLabelJa,
  geminiUsageMonthKeyJst,
  type GeminiUsageTokenSummary,
} from '@/lib/gemini-pricing';
import {
  buildParticipationSummaryRows,
  participationSummaryKey,
  type ParticipationHistoryRow,
  type ParticipationSummaryRow,
} from '@/lib/participation-summary';
import {
  emptyGeminiUsageByCategory,
  geminiUsageCategoryForContext,
  type GeminiUsageCategoryId,
} from '@/lib/gemini-usage-categories';

export type UserGeminiUsageLogRow = {
  context: string;
  model: string | null;
  prompt_token_count: number | null;
  output_token_count: number | null;
  room_id: string | null;
  created_at: string;
  billing_kind?: string | null;
  billing_user_id?: string | null;
  trigger_user_id?: string | null;
  user_id?: string | null;
};

export type UserGeminiUsageMonthlyRow = GeminiUsageTokenSummary & {
  monthKey: string;
  monthLabel: string;
};

export type UserGeminiUsageSlice = {
  bySlot: Record<string, GeminiUsageTokenSummary>;
  bySlotCategory: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  monthly: UserGeminiUsageMonthlyRow[];
  monthlyByCategory: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  totals: GeminiUsageTokenSummary;
};

export type UserGeminiUsageAggregate = UserGeminiUsageSlice & {
  /** あなたの操作（participant_user） */
  personal: UserGeminiUsageSlice;
  /** 主催者としての部屋共通（room_owner / guest_enjoy_owner_paid / ai_agent） */
  roomCommon: UserGeminiUsageSlice;
  logsWithUserId: number;
};

function emptySlice(): UserGeminiUsageSlice {
  return {
    bySlot: {},
    bySlotCategory: {},
    byCategory: emptyGeminiUsageByCategory(),
    monthly: [],
    monthlyByCategory: {},
    totals: emptyGeminiUsageSummary(),
  };
}

function matchLogToParticipationSlot(
  logMs: number,
  roomId: string,
  row: ParticipationSummaryRow,
  nowMs: number,
): boolean {
  if (row.room_id !== roomId) return false;
  const endMs = row.last_left_ms ?? (row.hasOpenSession ? nowMs : row.slotEndMs);
  return logMs >= row.first_joined_ms && logMs <= endMs;
}

export function logBelongsToUserBilling(log: UserGeminiUsageLogRow, userId: string): boolean {
  const billingUid = resolveLogBillingUserId(log as GeminiBillingLogRow);
  if (billingUid) return billingUid === userId;
  return log.user_id?.trim() === userId;
}

export function isRoomCommonBillingKind(kind: string | null | undefined): boolean {
  return kind === 'room_owner' || kind === 'guest_enjoy_owner_paid' || kind === 'ai_agent';
}

type SliceAccumulator = {
  bySlot: Record<string, GeminiUsageTokenSummary>;
  bySlotCategory: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  monthlyMap: Map<string, GeminiUsageTokenSummary>;
  monthlyByCategory: Map<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  totals: GeminiUsageTokenSummary;
};

function createAccumulator(slotKeys: string[]): SliceAccumulator {
  const bySlot: Record<string, GeminiUsageTokenSummary> = {};
  const bySlotCategory: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>> = {};
  for (const key of slotKeys) {
    bySlot[key] = emptyGeminiUsageSummary();
    bySlotCategory[key] = emptyGeminiUsageByCategory();
  }
  return {
    bySlot,
    bySlotCategory,
    byCategory: emptyGeminiUsageByCategory(),
    monthlyMap: new Map(),
    monthlyByCategory: new Map(),
    totals: emptyGeminiUsageSummary(),
  };
}

function addLogToAccumulator(
  acc: SliceAccumulator,
  log: UserGeminiUsageLogRow,
  summaryRows: ParticipationSummaryRow[],
  nowMs: number,
): void {
  const partial = emptyGeminiUsageSummary();
  addGeminiLogToSummary(partial, log);
  const category = geminiUsageCategoryForContext(log.context);

  addGeminiLogToSummary(acc.byCategory[category], log);
  addGeminiLogToSummary(acc.totals, log);

  const monthKey = geminiUsageMonthKeyJst(log.created_at);
  if (!acc.monthlyByCategory.has(monthKey)) {
    acc.monthlyByCategory.set(monthKey, emptyGeminiUsageByCategory());
  }
  addGeminiLogToSummary(acc.monthlyByCategory.get(monthKey)![category], log);

  const prevMonth = acc.monthlyMap.get(monthKey) ?? emptyGeminiUsageSummary();
  acc.monthlyMap.set(monthKey, {
    calls: prevMonth.calls + partial.calls,
    promptTokens: prevMonth.promptTokens + partial.promptTokens,
    outputTokens: prevMonth.outputTokens + partial.outputTokens,
    costUsd: prevMonth.costUsd + partial.costUsd,
    costJpyApprox: prevMonth.costJpyApprox + partial.costJpyApprox,
  });

  const roomId = log.room_id?.trim() || '';
  if (!roomId) return;
  const logMs = new Date(log.created_at).getTime();
  if (!Number.isFinite(logMs)) return;

  for (const row of summaryRows) {
    if (matchLogToParticipationSlot(logMs, roomId, row, nowMs)) {
      const key = participationSummaryKey(row);
      if (!acc.bySlot[key]) acc.bySlot[key] = emptyGeminiUsageSummary();
      addGeminiLogToSummary(acc.bySlot[key], log);
      if (!acc.bySlotCategory[key]) acc.bySlotCategory[key] = emptyGeminiUsageByCategory();
      addGeminiLogToSummary(acc.bySlotCategory[key][category], log);
      break;
    }
  }
}

function finalizeAccumulator(acc: SliceAccumulator): UserGeminiUsageSlice {
  const monthly: UserGeminiUsageMonthlyRow[] = Array.from(acc.monthlyMap.entries())
    .map(([monthKey, summary]) => ({
      monthKey,
      monthLabel: formatGeminiUsageMonthLabelJa(monthKey),
      ...summary,
    }))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const monthlyByCategoryOut: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>> =
    {};
  for (const [monthKey, cats] of acc.monthlyByCategory.entries()) {
    monthlyByCategoryOut[monthKey] = cats;
  }

  return {
    bySlot: acc.bySlot,
    bySlotCategory: acc.bySlotCategory,
    byCategory: acc.byCategory,
    monthly,
    monthlyByCategory: monthlyByCategoryOut,
    totals: acc.totals,
  };
}

export function aggregateUserGeminiUsage(
  participationHistory: ParticipationHistoryRow[],
  logs: UserGeminiUsageLogRow[],
  userId: string,
  nowMs: number = Date.now(),
): UserGeminiUsageAggregate {
  const summaryRows = buildParticipationSummaryRows(participationHistory, nowMs);
  const slotKeys = summaryRows.map((row) => participationSummaryKey(row));

  const billingAcc = createAccumulator(slotKeys);
  const personalAcc = createAccumulator(slotKeys);
  const roomCommonAcc = createAccumulator(slotKeys);
  let logsWithUserId = 0;

  for (const log of logs) {
    if (!logBelongsToUserBilling(log, userId)) continue;
    logsWithUserId += 1;

    addLogToAccumulator(billingAcc, log, summaryRows, nowMs);

    if (isRoomCommonBillingKind(log.billing_kind)) {
      addLogToAccumulator(roomCommonAcc, log, summaryRows, nowMs);
    } else {
      addLogToAccumulator(personalAcc, log, summaryRows, nowMs);
    }
  }

  const billing = finalizeAccumulator(billingAcc);
  return {
    ...billing,
    personal: finalizeAccumulator(personalAcc),
    roomCommon: finalizeAccumulator(roomCommonAcc),
    logsWithUserId,
  };
}
