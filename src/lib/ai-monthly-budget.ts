/**
 * 月次変動費（Gemini + YouTube API + Ably 推定）が上限を超えたら AI 系 API を停止するキルスイッチ。
 *
 * env:
 * - `AI_MONTHLY_VARIABLE_BUDGET_ENABLED=1` … 有効化（未設定時はオフ）
 * - `AI_MONTHLY_VARIABLE_BUDGET_JPY` … 上限円（既定 100000）
 * - `AI_BUDGET_KILL_SWITCH=1` … 手動即停止（集計より優先）
 * - `AI_MONTHLY_VARIABLE_BUDGET_CACHE_MS` … 集計キャッシュ TTL（既定 60000）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateRoomCostSummaries } from '@/lib/room-cost-aggregate';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRoomHistoryProductId } from '@/lib/room-history-product';

export type AiOperationsHaltReason = 'manual_kill_switch' | 'monthly_budget_exceeded' | null;

export type AiMonthlyBudgetStatus = {
  enabled: boolean;
  halted: boolean;
  reason: AiOperationsHaltReason;
  budgetJpy: number;
  variableCostJpyApprox: number;
  monthKeyJst: string;
  checkedAtIso: string | null;
};

const DEFAULT_BUDGET_JPY = 100_000;
const DEFAULT_CACHE_MS = 60_000;

let cachedStatus: AiMonthlyBudgetStatus | null = null;
let refreshInFlight: Promise<AiMonthlyBudgetStatus> | null = null;

/** JST の当月 1 日 00:00 を ISO 文字列で返す */
export function jstMonthStartIso(nowMs = Date.now()): string {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  return new Date(Date.UTC(y, m, 1) - 9 * 60 * 60 * 1000).toISOString();
}

export function jstMonthKey(nowMs = Date.now()): string {
  const jst = new Date(nowMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function isAiMonthlyVariableBudgetEnabled(): boolean {
  if (process.env.AI_MONTHLY_VARIABLE_BUDGET_DISABLED === '1') return false;
  return process.env.AI_MONTHLY_VARIABLE_BUDGET_ENABLED === '1';
}

export function isAiBudgetManualKillSwitchOn(): boolean {
  return process.env.AI_BUDGET_KILL_SWITCH === '1';
}

export function resolveAiMonthlyVariableBudgetJpy(): number {
  const raw = process.env.AI_MONTHLY_VARIABLE_BUDGET_JPY?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return DEFAULT_BUDGET_JPY;
}

function resolveCacheMs(): number {
  const raw = process.env.AI_MONTHLY_VARIABLE_BUDGET_CACHE_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 5000) return Math.round(n);
  }
  return DEFAULT_CACHE_MS;
}

function buildManualHaltStatus(nowMs = Date.now()): AiMonthlyBudgetStatus {
  return {
    enabled: true,
    halted: true,
    reason: 'manual_kill_switch',
    budgetJpy: resolveAiMonthlyVariableBudgetJpy(),
    variableCostJpyApprox: cachedStatus?.variableCostJpyApprox ?? 0,
    monthKeyJst: jstMonthKey(nowMs),
    checkedAtIso: new Date(nowMs).toISOString(),
  };
}

function buildDisabledStatus(nowMs = Date.now()): AiMonthlyBudgetStatus {
  return {
    enabled: false,
    halted: false,
    reason: null,
    budgetJpy: resolveAiMonthlyVariableBudgetJpy(),
    variableCostJpyApprox: 0,
    monthKeyJst: jstMonthKey(nowMs),
    checkedAtIso: null,
  };
}

export async function sumMonthlyVariableCostJpyApprox(
  admin: SupabaseClient,
  nowMs = Date.now(),
): Promise<number> {
  const fromIso = jstMonthStartIso(nowMs);
  const { rooms } = await aggregateRoomCostSummaries(admin, {
    fromIso,
    nowMs,
    productFilter: getRoomHistoryProductId(),
  });
  let total = 0;
  for (const row of rooms) {
    total += row.total_cost_jpy_approx;
  }
  return total;
}

async function refreshAiMonthlyBudgetStatus(nowMs = Date.now()): Promise<AiMonthlyBudgetStatus> {
  if (isAiBudgetManualKillSwitchOn()) {
    cachedStatus = buildManualHaltStatus(nowMs);
    return cachedStatus;
  }

  if (!isAiMonthlyVariableBudgetEnabled()) {
    cachedStatus = buildDisabledStatus(nowMs);
    return cachedStatus;
  }

  const budgetJpy = resolveAiMonthlyVariableBudgetJpy();
  const monthKeyJst = jstMonthKey(nowMs);
  let variableCostJpyApprox = 0;

  const admin = createAdminClient();
  if (!admin) {
    console.warn('[ai-monthly-budget] admin client unavailable; fail-open (not halted)');
    cachedStatus = {
      enabled: true,
      halted: false,
      reason: null,
      budgetJpy,
      variableCostJpyApprox: 0,
      monthKeyJst,
      checkedAtIso: new Date(nowMs).toISOString(),
    };
    return cachedStatus;
  }

  try {
    variableCostJpyApprox = await sumMonthlyVariableCostJpyApprox(admin, nowMs);
  } catch (e) {
    console.warn('[ai-monthly-budget] aggregate failed; fail-open', e);
    cachedStatus = {
      enabled: true,
      halted: false,
      reason: null,
      budgetJpy,
      variableCostJpyApprox: cachedStatus?.variableCostJpyApprox ?? 0,
      monthKeyJst,
      checkedAtIso: new Date(nowMs).toISOString(),
    };
    return cachedStatus;
  }

  const halted = variableCostJpyApprox >= budgetJpy;
  if (halted) {
    console.warn('[ai-monthly-budget] monthly variable budget exceeded; AI halted', {
      monthKeyJst,
      variableCostJpyApprox,
      budgetJpy,
    });
  }

  cachedStatus = {
    enabled: true,
    halted,
    reason: halted ? 'monthly_budget_exceeded' : null,
    budgetJpy,
    variableCostJpyApprox,
    monthKeyJst,
    checkedAtIso: new Date(nowMs).toISOString(),
  };
  return cachedStatus;
}

/** 非同期で集計を更新（API 入口から fire-and-forget 可） */
export function touchAiMonthlyBudgetRefresh(): void {
  if (isAiBudgetManualKillSwitchOn()) {
    cachedStatus = buildManualHaltStatus();
    return;
  }
  if (!isAiMonthlyVariableBudgetEnabled()) return;

  const now = Date.now();
  const cacheMs = resolveCacheMs();
  if (cachedStatus?.checkedAtIso) {
    const age = now - new Date(cachedStatus.checkedAtIso).getTime();
    if (age >= 0 && age < cacheMs) return;
  }
  if (refreshInFlight) return;
  refreshInFlight = refreshAiMonthlyBudgetStatus(now).finally(() => {
    refreshInFlight = null;
  });
}

export function getAiMonthlyBudgetStatusSync(): AiMonthlyBudgetStatus {
  if (isAiBudgetManualKillSwitchOn()) {
    return buildManualHaltStatus();
  }
  if (!isAiMonthlyVariableBudgetEnabled()) {
    return buildDisabledStatus();
  }
  return (
    cachedStatus ?? {
      enabled: true,
      halted: false,
      reason: null,
      budgetJpy: resolveAiMonthlyVariableBudgetJpy(),
      variableCostJpyApprox: 0,
      monthKeyJst: jstMonthKey(),
      checkedAtIso: null,
    }
  );
}

export function isAiOperationsHaltedSync(): boolean {
  return getAiMonthlyBudgetStatusSync().halted;
}

export async function ensureAiMonthlyBudgetStatusFresh(): Promise<AiMonthlyBudgetStatus> {
  if (isAiBudgetManualKillSwitchOn()) {
    cachedStatus = buildManualHaltStatus();
    return cachedStatus;
  }
  if (!isAiMonthlyVariableBudgetEnabled()) {
    cachedStatus = buildDisabledStatus();
    return cachedStatus;
  }

  const now = Date.now();
  const cacheMs = resolveCacheMs();
  if (cachedStatus?.checkedAtIso) {
    const age = now - new Date(cachedStatus.checkedAtIso).getTime();
    if (age >= 0 && age < cacheMs) return cachedStatus;
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshAiMonthlyBudgetStatus(now).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function aiOperationsHaltedUserMessageJa(reason: AiOperationsHaltReason): string {
  if (reason === 'manual_kill_switch') {
    return 'AI 機能は運営の都合により一時停止しています。選曲・再生・通常チャットはご利用いただけます。';
  }
  if (reason === 'monthly_budget_exceeded') {
    return '今月の AI 利用上限に達したため、AI 機能を一時停止しています。選曲・再生・通常チャットはご利用いただけます。';
  }
  return 'AI 機能は一時停止しています。';
}

/** 単体テスト用: キャッシュをクリア */
export function resetAiMonthlyBudgetCacheForTests(): void {
  cachedStatus = null;
  refreshInFlight = null;
}
