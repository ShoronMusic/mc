/**
 * 管理画面: user_ai_trial 一覧・サマリー・詳細
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AI_TRIAL_AT_QUESTIONS_GRANTED,
  AI_TRIAL_SONGS_GRANTED,
  isAiTrialEnforcementEnabled,
} from '@/lib/ai-trial-status';
import { isAiCreditsEnabled } from '@/lib/ai-credits-config';
import { resolveAdminUserDisplayLabels, shortUserIdLabel } from '@/lib/admin-user-display-labels';
import { isAiTrialAdminMonitoringExcludedUserId } from '@/lib/ai-trial-admin-excluded-user-ids';
import { listAiCreditTransactions, type AdminAiCreditTransactionRow } from '@/lib/user-ai-credits-server';
import type { UserAiTrialRow } from '@/lib/user-ai-trial-server';
import { isMissingUserAiTrialTable } from '@/lib/user-ai-trial-server';

function isMissingUserAiTrialConsumptionLogTable(message: string): boolean {
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /user_ai_trial_consumption_log/i.test(message)
  );
}

export type AdminTrialStatusFilter = 'all' | 'active' | 'exhausted' | 'at_remaining' | 'partial';

export type AdminTrialRowPhase = 'active' | 'exhausted' | 'songs_only' | 'at_only';

export type AdminUserAiTrialListRow = {
  userId: string;
  displayName: string;
  songsGranted: number;
  songsRemaining: number;
  songsUsed: number;
  atQuestionsGranted: number;
  atQuestionsRemaining: number;
  atQuestionsUsed: number;
  phase: AdminTrialRowPhase;
  creditsRemaining: number | null;
  creditsEnabled: boolean;
  firstIp: string | null;
  lastIp: string | null;
  emailVerifiedAtGrant: string | null;
  createdAt: string;
  updatedAt: string;
  email: string | null;
};

export type AdminUserAiTrialOverview = {
  enabled: boolean;
  missingTable: boolean;
  enforcementEnabled: boolean;
  creditsEnabled: boolean;
  creditsTableMissing: boolean;
  consumptionLogEnabled: boolean;
  totalUsers: number;
  activeUsers: number;
  exhaustedUsers: number;
  partialUsers: number;
  atRemainingUsers: number;
  updatedLast24h: number;
  updatedLast7d: number;
  /** STYLE_ADMIN / 開発者無制限（一覧・集計から除外した人数） */
  excludedAdminUsers: number;
};

export type AdminAiTrialConsumptionLogRow = {
  id: string;
  kind: 'song_full' | 'at_question';
  roomId: string | null;
  videoId: string | null;
  clientIp: string | null;
  createdAt: string;
};

export type AdminUserAiTrialDetail = {
  row: AdminUserAiTrialListRow;
  consumptionLogs: AdminAiTrialConsumptionLogRow[];
  consumptionLogError: string | null;
  creditTransactions: AdminAiCreditTransactionRow[];
  creditTransactionsError: string | null;
  creditsTableMissing: boolean;
};

export function classifyAdminTrialRowPhase(row: {
  songs_remaining: number;
  at_questions_remaining: number;
}): AdminTrialRowPhase {
  const songs = Math.max(0, Number(row.songs_remaining) || 0);
  const at = Math.max(0, Number(row.at_questions_remaining) || 0);
  if (songs > 0 && at > 0) return 'active';
  if (songs === 0 && at === 0) return 'exhausted';
  if (songs > 0) return 'songs_only';
  return 'at_only';
}

function mapTrialRow(
  row: UserAiTrialRow,
  displayName: string,
  email: string | null,
  creditsRemaining: number | null = null,
): AdminUserAiTrialListRow {
  const songsGranted = Number(row.songs_granted) || AI_TRIAL_SONGS_GRANTED;
  const songsRemaining = Math.max(0, Number(row.songs_remaining) || 0);
  const atGranted = Number(row.at_questions_granted) || AI_TRIAL_AT_QUESTIONS_GRANTED;
  const atRemaining = Math.max(0, Number(row.at_questions_remaining) || 0);
  return {
    userId: row.user_id,
    displayName,
    songsGranted,
    songsRemaining,
    songsUsed: Math.max(0, songsGranted - songsRemaining),
    atQuestionsGranted: atGranted,
    atQuestionsRemaining: atRemaining,
    atQuestionsUsed: Math.max(0, atGranted - atRemaining),
    phase: classifyAdminTrialRowPhase(row),
    creditsRemaining,
    creditsEnabled: isAiCreditsEnabled(),
    firstIp: row.first_ip,
    lastIp: row.last_ip,
    emailVerifiedAtGrant: row.email_verified_at_grant,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    email,
  };
}

function matchesStatusFilter(
  row: UserAiTrialRow,
  filter: AdminTrialStatusFilter,
): boolean {
  const songs = Math.max(0, Number(row.songs_remaining) || 0);
  const at = Math.max(0, Number(row.at_questions_remaining) || 0);
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return songs > 0;
    case 'exhausted':
      return songs === 0;
    case 'at_remaining':
      return at > 0;
    case 'partial':
      return (songs === 0 && at > 0) || (songs > 0 && at === 0);
    default:
      return true;
  }
}

function matchesSearch(row: UserAiTrialRow, q: string, email: string | null): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (row.user_id.toLowerCase().includes(needle)) return true;
  if (email && email.toLowerCase().includes(needle)) return true;
  return false;
}

async function resolveEmailsForUsers(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const userId of userIds) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) {
        out.set(userId, null);
        continue;
      }
      out.set(userId, data.user?.email?.trim() || null);
    } catch {
      out.set(userId, null);
    }
  }
  return out;
}

async function fetchCreditsRemainingByUserIds(
  admin: SupabaseClient,
  userIds: string[],
): Promise<{ map: Map<string, number>; missingTable: boolean }> {
  const map = new Map<string, number>();
  if (!isAiCreditsEnabled() || userIds.length === 0) {
    return { map, missingTable: false };
  }
  const { data, error } = await admin
    .from('user_ai_credits')
    .select('user_id, credits_remaining')
    .in('user_id', userIds);
  if (error) {
    const missing = /relation|does not exist|schema cache/i.test(error.message) && /user_ai_credits/i.test(error.message);
    return { map, missingTable: missing };
  }
  for (const row of data ?? []) {
    const uid = typeof row.user_id === 'string' ? row.user_id : '';
    if (!uid) continue;
    map.set(uid, Math.max(0, Number(row.credits_remaining) || 0));
  }
  return { map, missingTable: false };
}

export async function fetchAdminUserAiTrialOverview(
  admin: SupabaseClient,
): Promise<AdminUserAiTrialOverview> {
  const base = {
    enabled: true,
    missingTable: false,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    creditsEnabled: isAiCreditsEnabled(),
    creditsTableMissing: false,
    consumptionLogEnabled: false,
    totalUsers: 0,
    activeUsers: 0,
    exhaustedUsers: 0,
    partialUsers: 0,
    atRemainingUsers: 0,
    updatedLast24h: 0,
    updatedLast7d: 0,
    excludedAdminUsers: 0,
  };

  const { data, error } = await admin
    .from('user_ai_trial')
    .select('user_id, songs_remaining, at_questions_remaining, updated_at');

  if (error) {
    if (isMissingUserAiTrialTable(error.message)) {
      return { ...base, enabled: false, missingTable: true };
    }
    throw new Error(error.message);
  }

  const logProbe = await admin.from('user_ai_trial_consumption_log').select('id').limit(1);
  const consumptionLogEnabled =
    !logProbe.error || !isMissingUserAiTrialConsumptionLogTable(logProbe.error.message);

  const creditsProbe = await admin.from('user_ai_credits').select('user_id').limit(1);
  const creditsTableMissing =
    isAiCreditsEnabled() &&
    !!creditsProbe.error &&
    /relation|does not exist|schema cache/i.test(creditsProbe.error.message) &&
    /user_ai_credits/i.test(creditsProbe.error.message);

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    const uid = typeof row.user_id === 'string' ? row.user_id : '';
    if (isAiTrialAdminMonitoringExcludedUserId(uid)) {
      base.excludedAdminUsers += 1;
      continue;
    }
    base.totalUsers += 1;
    const songs = Math.max(0, Number(row.songs_remaining) || 0);
    const at = Math.max(0, Number(row.at_questions_remaining) || 0);
    if (songs > 0) base.activeUsers += 1;
    if (songs === 0) base.exhaustedUsers += 1;
    if (at > 0) base.atRemainingUsers += 1;
    if ((songs === 0 && at > 0) || (songs > 0 && at === 0)) base.partialUsers += 1;

    const updatedAt = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : NaN;
    if (Number.isFinite(updatedAt)) {
      if (now - updatedAt <= dayMs) base.updatedLast24h += 1;
      if (now - updatedAt <= 7 * dayMs) base.updatedLast7d += 1;
    }
  }

  return { ...base, consumptionLogEnabled, creditsTableMissing };
}

export async function listAdminUserAiTrialRows(
  admin: SupabaseClient,
  options: {
    status?: AdminTrialStatusFilter;
    q?: string;
    limit?: number;
    offset?: number;
    sort?: 'updated_desc' | 'created_desc' | 'songs_remaining_asc';
  },
): Promise<{
  rows: AdminUserAiTrialListRow[];
  total: number;
  missingTable: boolean;
}> {
  const status = options.status ?? 'all';
  const q = options.q?.trim() ?? '';
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const sort = options.sort ?? 'updated_desc';

  let query = admin.from('user_ai_trial').select('*', { count: 'exact' });

  if (sort === 'updated_desc') query = query.order('updated_at', { ascending: false });
  else if (sort === 'created_desc') query = query.order('created_at', { ascending: false });
  else query = query.order('songs_remaining', { ascending: true }).order('updated_at', { ascending: false });

  const { data, error, count } = await query.range(0, 9999);

  if (error) {
    if (isMissingUserAiTrialTable(error.message)) {
      return { rows: [], total: 0, missingTable: true };
    }
    throw new Error(error.message);
  }

  const rawRows = (data ?? []).filter(
    (row) => !isAiTrialAdminMonitoringExcludedUserId(row.user_id),
  ) as UserAiTrialRow[];
  const filtered = rawRows.filter((row) => matchesStatusFilter(row, status));

  const emails = q ? await resolveEmailsForUsers(admin, filtered.map((r) => r.user_id)) : new Map();
  const searched = q
    ? filtered.filter((row) => matchesSearch(row, q, emails.get(row.user_id) ?? null))
    : filtered;

  const page = searched.slice(offset, offset + limit);
  const labels = await resolveAdminUserDisplayLabels(
    admin,
    page.map((r) => r.user_id),
  );

  const pageEmails =
    q.length > 0
      ? emails
      : await resolveEmailsForUsers(
          admin,
          page.map((r) => r.user_id),
        );

  const creditsBatch = await fetchCreditsRemainingByUserIds(
    admin,
    page.map((r) => r.user_id),
  );

  const rows = page.map((row) => {
    const creditsRemaining = creditsBatch.map.has(row.user_id)
      ? (creditsBatch.map.get(row.user_id) ?? 0)
      : isAiCreditsEnabled()
        ? 0
        : null;
    return mapTrialRow(
      row,
      labels.get(row.user_id) ?? shortUserIdLabel(row.user_id),
      pageEmails.get(row.user_id) ?? null,
      creditsRemaining,
    );
  });

  return { rows, total: searched.length, missingTable: false };
}

export async function fetchAdminUserAiTrialDetail(
  admin: SupabaseClient,
  userId: string,
): Promise<{ detail: AdminUserAiTrialDetail | null; missingTable: boolean }> {
  const uid = userId.trim();
  if (!uid) return { detail: null, missingTable: false };
  if (isAiTrialAdminMonitoringExcludedUserId(uid)) {
    return { detail: null, missingTable: false };
  }

  const { data, error } = await admin.from('user_ai_trial').select('*').eq('user_id', uid).maybeSingle();

  if (error) {
    if (isMissingUserAiTrialTable(error.message)) {
      return { detail: null, missingTable: true };
    }
    throw new Error(error.message);
  }
  if (!data) return { detail: null, missingTable: false };

  const row = data as UserAiTrialRow;
  const labels = await resolveAdminUserDisplayLabels(admin, [uid]);
  const emailMap = await resolveEmailsForUsers(admin, [uid]);

  const logsRes = await admin
    .from('user_ai_trial_consumption_log')
    .select('id, kind, room_id, video_id, client_ip, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(100);

  let consumptionLogs: AdminAiTrialConsumptionLogRow[] = [];
  let consumptionLogError: string | null = null;
  if (logsRes.error) {
    if (!isMissingUserAiTrialConsumptionLogTable(logsRes.error.message)) {
      consumptionLogError = logsRes.error.message;
    }
  } else {
    consumptionLogs = (logsRes.data ?? []).map((log) => ({
      id: String(log.id),
      kind: log.kind === 'at_question' ? 'at_question' : 'song_full',
      roomId: typeof log.room_id === 'string' ? log.room_id : null,
      videoId: typeof log.video_id === 'string' ? log.video_id : null,
      clientIp: typeof log.client_ip === 'string' ? log.client_ip : null,
      createdAt: String(log.created_at),
    }));
  }

  const creditsBatch = await fetchCreditsRemainingByUserIds(admin, [uid]);
  const creditsRemaining = creditsBatch.map.has(uid)
    ? (creditsBatch.map.get(uid) ?? 0)
    : isAiCreditsEnabled()
      ? 0
      : null;

  const creditTx = await listAiCreditTransactions(admin, uid, 50);

  return {
    detail: {
      row: mapTrialRow(
        row,
        labels.get(uid) ?? shortUserIdLabel(uid),
        emailMap.get(uid) ?? null,
        creditsRemaining,
      ),
      consumptionLogs,
      consumptionLogError,
      creditTransactions: creditTx.rows,
      creditTransactionsError: creditTx.error,
      creditsTableMissing: creditTx.missingTable || creditsBatch.missingTable,
    },
    missingTable: false,
  };
}
