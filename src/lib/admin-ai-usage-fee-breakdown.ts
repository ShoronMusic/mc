/**
 * 管理画面: Gemini 原価を月・日・累計 × 機能 × 使用者／主催者で集計する。
 * 金額は API 原価の円試算（参加者クレジットの請求額ではない）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { shortUserIdLabel, resolveAdminUserDisplayLabels } from '@/lib/admin-user-display-labels';
import { calcGeminiCostJpyApprox, calcGeminiCostUsd } from '@/lib/gemini-pricing';
import {
  parseAdminProductFilter,
  runAdminHistoryQueryScoped,
  type AdminProductFilter,
} from '@/lib/room-history-product';

export const AI_USAGE_FEE_CATEGORY_IDS = [
  'commentary',
  'quiz',
  'recommend',
  'agent_speech',
  'agent_pick',
  'at_question',
  'other',
] as const;

export type AiUsageFeeCategoryId = (typeof AI_USAGE_FEE_CATEGORY_IDS)[number];

export const AI_USAGE_FEE_CATEGORY_LABEL: Record<AiUsageFeeCategoryId, string> = {
  commentary: '曲解説',
  quiz: 'クイズ',
  recommend: 'おすすめ',
  agent_speech: 'エージェント発言',
  agent_pick: 'エージェント選曲',
  at_question: '@質問',
  other: '他',
};

export type AiUsageFeePayer = 'user' | 'organizer';

export type AiUsageFeeCell = {
  calls: number;
  costJpyApprox: number;
};

export type AiUsageFeeSide = {
  byCategory: Record<AiUsageFeeCategoryId, AiUsageFeeCell>;
  total: AiUsageFeeCell;
};

export type AiUsageFeePeriodRow = {
  key: string;
  label: string;
  user: AiUsageFeeSide;
  organizer: AiUsageFeeSide;
};

export type AiUsageFeePersonRow = {
  userId: string;
  displayName: string;
  byCategory: Record<AiUsageFeeCategoryId, AiUsageFeeCell>;
  total: AiUsageFeeCell;
};

export type AiUsageFeeBreakdown = {
  truncated: boolean;
  rowCount: number;
  summary: {
    total: AiUsageFeePeriodRow;
    month: AiUsageFeePeriodRow;
    today: AiUsageFeePeriodRow;
  };
  months: AiUsageFeePeriodRow[];
  days: AiUsageFeePeriodRow[];
  users: AiUsageFeePersonRow[];
  organizers: AiUsageFeePersonRow[];
};

export type AiUsageFeeLogRow = {
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

export const AI_USAGE_FEE_UNASSIGNED_OWNER_ID = '__unassigned_owner__';
export const AI_USAGE_FEE_UNKNOWN_USER_ID = '__unknown_user__';

const PAGE_SIZE = 1000;
const MAX_ROWS = 40000;

const SELECT_FULL =
  'context, model, prompt_token_count, output_token_count, billing_kind, billing_user_id, user_id, trigger_user_id, created_at';
const SELECT_LEGACY =
  'context, model, prompt_token_count, output_token_count, user_id, created_at';

export function emptyAiUsageFeeCell(): AiUsageFeeCell {
  return { calls: 0, costJpyApprox: 0 };
}

export function emptyAiUsageFeeSide(): AiUsageFeeSide {
  const byCategory = {} as Record<AiUsageFeeCategoryId, AiUsageFeeCell>;
  for (const id of AI_USAGE_FEE_CATEGORY_IDS) {
    byCategory[id] = emptyAiUsageFeeCell();
  }
  return { byCategory, total: emptyAiUsageFeeCell() };
}

/** JST の YYYY-MM-DD */
export function geminiUsageDayKeyJst(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function geminiUsageMonthKeyFromDay(dayKey: string): string {
  return dayKey.length >= 7 ? dayKey.slice(0, 7) : dayKey;
}

export function formatAiUsageFeeDayLabel(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}

export function formatAiUsageFeeMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${m[1]}年${Number(m[2])}月`;
}

export function classifyAiUsageFeeCategory(context: string): AiUsageFeeCategoryId {
  const c = context.trim();
  if (c === 'song_quiz' || c.startsWith('song_quiz_')) return 'quiz';
  if (
    c === 'next_song_recommend' ||
    c === 'next_song_recomend' ||
    c.startsWith('next_song_recommend_')
  ) {
    return 'recommend';
  }
  if (c === 'character_chat' || c.startsWith('character_chat_')) return 'agent_speech';
  if (c === 'character_song_pick' || c.startsWith('character_song_pick_')) return 'agent_pick';
  if (
    c === 'commentary' ||
    c === 'commentary_copyedit' ||
    c.startsWith('comment_pack_') ||
    c.startsWith('commentary_')
  ) {
    return 'commentary';
  }
  if (
    c === 'chat_reply' ||
    c.startsWith('chat_reply_') ||
    c === 'question_guard_classify' ||
    c === 'extract_song_search'
  ) {
    return 'at_question';
  }
  return 'other';
}

export function classifyAiUsageFeePayer(log: {
  billing_kind: string | null;
  billing_user_id?: string | null;
  user_id?: string | null;
  trigger_user_id?: string | null;
}): AiUsageFeePayer {
  const kind = log.billing_kind?.trim() || '';
  if (kind === 'participant_user') return 'user';
  if (kind === 'guest_enjoy_owner_paid' || kind === 'room_owner' || kind === 'ai_agent') {
    return 'organizer';
  }
  const actor =
    log.trigger_user_id?.trim() || log.user_id?.trim() || log.billing_user_id?.trim() || '';
  return actor ? 'user' : 'organizer';
}

function actorUserId(log: AiUsageFeeLogRow): string {
  return (
    log.billing_user_id?.trim() ||
    log.trigger_user_id?.trim() ||
    log.user_id?.trim() ||
    ''
  );
}

function addCell(cell: AiUsageFeeCell, log: AiUsageFeeLogRow): void {
  cell.calls += 1;
  const usd = calcGeminiCostUsd(
    log.prompt_token_count ?? 0,
    log.output_token_count ?? 0,
    (log.model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash',
  );
  cell.costJpyApprox += calcGeminiCostJpyApprox(usd);
}

function addToSide(side: AiUsageFeeSide, category: AiUsageFeeCategoryId, log: AiUsageFeeLogRow): void {
  addCell(side.byCategory[category], log);
  addCell(side.total, log);
}

function periodBucket(
  map: Map<string, AiUsageFeePeriodRow>,
  key: string,
  label: string,
): AiUsageFeePeriodRow {
  let row = map.get(key);
  if (!row) {
    row = { key, label, user: emptyAiUsageFeeSide(), organizer: emptyAiUsageFeeSide() };
    map.set(key, row);
  }
  return row;
}

function personBucket(map: Map<string, AiUsageFeePersonRow>, userId: string): AiUsageFeePersonRow {
  let row = map.get(userId);
  if (!row) {
    const byCategory = {} as Record<AiUsageFeeCategoryId, AiUsageFeeCell>;
    for (const id of AI_USAGE_FEE_CATEGORY_IDS) byCategory[id] = emptyAiUsageFeeCell();
    row = { userId, displayName: userId, byCategory, total: emptyAiUsageFeeCell() };
    map.set(userId, row);
  }
  return row;
}

function sortPeriodsDesc(rows: AiUsageFeePeriodRow[]): AiUsageFeePeriodRow[] {
  return rows.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

function sortPeople(rows: AiUsageFeePersonRow[]): AiUsageFeePersonRow[] {
  return rows.sort((a, b) => b.total.costJpyApprox - a.total.costJpyApprox || b.total.calls - a.total.calls);
}

export function buildAiUsageFeeBreakdown(
  logs: AiUsageFeeLogRow[],
  nowMs = Date.now(),
): AiUsageFeeBreakdown {
  const todayKey = geminiUsageDayKeyJst(new Date(nowMs).toISOString());
  const monthKey = geminiUsageMonthKeyFromDay(todayKey);
  const months = new Map<string, AiUsageFeePeriodRow>();
  const days = new Map<string, AiUsageFeePeriodRow>();
  const users = new Map<string, AiUsageFeePersonRow>();
  const organizers = new Map<string, AiUsageFeePersonRow>();
  const total = periodBucket(new Map(), 'total', '累計');
  const month = periodBucket(new Map(), monthKey, formatAiUsageFeeMonthLabel(monthKey));
  const today = periodBucket(new Map(), todayKey, formatAiUsageFeeDayLabel(todayKey));

  for (const log of logs) {
    const category = classifyAiUsageFeeCategory(log.context || '');
    const payer = classifyAiUsageFeePayer(log);
    const dayKey = geminiUsageDayKeyJst(log.created_at);
    const logMonthKey = geminiUsageMonthKeyFromDay(dayKey);
    const dayRow = periodBucket(days, dayKey, formatAiUsageFeeDayLabel(dayKey));
    const monthRow = periodBucket(months, logMonthKey, formatAiUsageFeeMonthLabel(logMonthKey));

    addToSide(total[payer], category, log);
    addToSide(dayRow[payer], category, log);
    addToSide(monthRow[payer], category, log);
    if (logMonthKey === monthKey) addToSide(month[payer], category, log);
    if (dayKey === todayKey) addToSide(today[payer], category, log);

    if (payer === 'user') {
      const uid = actorUserId(log) || AI_USAGE_FEE_UNKNOWN_USER_ID;
      const person = personBucket(users, uid);
      addCell(person.byCategory[category], log);
      addCell(person.total, log);
    } else {
      const uid = log.billing_user_id?.trim() || AI_USAGE_FEE_UNASSIGNED_OWNER_ID;
      const person = personBucket(organizers, uid);
      addCell(person.byCategory[category], log);
      addCell(person.total, log);
    }
  }

  return {
    truncated: false,
    rowCount: logs.length,
    summary: { total, month, today },
    months: sortPeriodsDesc(Array.from(months.values())),
    days: sortPeriodsDesc(Array.from(days.values())),
    users: sortPeople(Array.from(users.values())),
    organizers: sortPeople(Array.from(organizers.values())),
  };
}

function applyDisplayNames(
  rows: AiUsageFeePersonRow[],
  labels: Map<string, string>,
): void {
  for (const row of rows) {
    if (row.userId === AI_USAGE_FEE_UNASSIGNED_OWNER_ID) {
      row.displayName = '主催者未記録';
      continue;
    }
    if (row.userId === AI_USAGE_FEE_UNKNOWN_USER_ID) {
      row.displayName = '使用者未記録';
      continue;
    }
    row.displayName = labels.get(row.userId) ?? shortUserIdLabel(row.userId);
  }
}

export async function loadAiUsageFeeBreakdown(
  admin: SupabaseClient,
  options: { productFilter?: AdminProductFilter; nowMs?: number } = {},
): Promise<{ enabled: boolean; hint?: string; breakdown: AiUsageFeeBreakdown | null }> {
  const productFilter = options.productFilter ?? parseAdminProductFilter(null);
  const rows: AiUsageFeeLogRow[] = [];
  let truncated = false;
  let legacy = false;

  const pullPage = async (from: number): Promise<{ rows: AiUsageFeeLogRow[]; errorCode: string | null; done: boolean }> => {
    const res = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
      let q = admin
        .from('gemini_usage_logs')
        .select(legacy ? SELECT_LEGACY : SELECT_FULL)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (applyProductEq && scopedProduct) q = q.eq('product', scopedProduct);
      return q;
    }, productFilter);
    const code = res.error?.code ?? null;
    if (code === '42P01') return { rows: [], errorCode: code, done: true };
    if (code === '42703' && !legacy) return { rows: [], errorCode: code, done: false };
    if (res.error && code !== '42P01') {
      throw new Error(res.error.message ?? 'gemini_usage_logs query failed');
    }
    const page = ((res.data ?? []) as unknown as Array<Record<string, unknown>>).map((raw) => ({
      context: typeof raw.context === 'string' ? raw.context : '',
      model: typeof raw.model === 'string' ? raw.model : null,
      prompt_token_count: typeof raw.prompt_token_count === 'number' ? raw.prompt_token_count : null,
      output_token_count: typeof raw.output_token_count === 'number' ? raw.output_token_count : null,
      billing_kind: typeof raw.billing_kind === 'string' ? raw.billing_kind : null,
      billing_user_id: typeof raw.billing_user_id === 'string' ? raw.billing_user_id : null,
      user_id: typeof raw.user_id === 'string' ? raw.user_id : null,
      trigger_user_id: typeof raw.trigger_user_id === 'string' ? raw.trigger_user_id : null,
      created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    }));
    return { rows: page, errorCode: null, done: page.length < PAGE_SIZE };
  };

  let from = 0;
  while (from < MAX_ROWS) {
    const page = await pullPage(from);
    if (page.errorCode === '42P01') {
      return {
        enabled: false,
        hint: 'gemini_usage_logs テーブルが未作成です。',
        breakdown: null,
      };
    }
    if (page.errorCode === '42703' && !legacy) {
      legacy = true;
      from = 0;
      rows.length = 0;
      continue;
    }
    rows.push(...page.rows);
    if (page.done) break;
    from += PAGE_SIZE;
    if (from >= MAX_ROWS) {
      truncated = true;
      break;
    }
  }

  const breakdown = buildAiUsageFeeBreakdown(rows, options.nowMs ?? Date.now());
  breakdown.truncated = truncated;
  const ids = [
    ...breakdown.users.map((r) => r.userId),
    ...breakdown.organizers.map((r) => r.userId),
  ].filter((id) => id !== AI_USAGE_FEE_UNASSIGNED_OWNER_ID && id !== AI_USAGE_FEE_UNKNOWN_USER_ID);
  const labels = await resolveAdminUserDisplayLabels(admin, ids);
  applyDisplayNames(breakdown.users, labels);
  applyDisplayNames(breakdown.organizers, labels);
  return { enabled: true, breakdown };
}
