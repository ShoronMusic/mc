import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AI_CREDIT_COST_PER_AT_QUESTION,
  AI_CREDIT_COST_PER_SONG,
  isAiCreditsEnabled,
  normalizeAiCreditAmount,
} from '@/lib/ai-credits-config';
import {
  AI_TRIAL_AT_QUESTIONS_GRANTED,
  AI_TRIAL_SONGS_GRANTED,
  isAiTrialEnforcementEnabled,
  resolveTrialPhaseFromEntitlement,
  type AiTrialPhase,
  type AiTrialStatus,
} from '@/lib/ai-trial-status';
import type { UserAiTrialRow } from '@/lib/user-ai-trial-server';
import { rowToAiTrialStatus } from '@/lib/user-ai-trial-server';

export type UserAiCreditsRow = {
  user_id: string;
  credits_remaining: number;
  credits_lifetime_granted: number;
  created_at: string;
  updated_at: string;
};

export type AiCreditTransactionKind =
  | 'grant_admin'
  | 'grant_purchase'
  | 'consume_song'
  | 'consume_at_question';

export type AiCreditGuardDeny = {
  ok: false;
  status: number;
  body: {
    error: string;
    message: string;
    songsRemaining?: number;
    atQuestionsRemaining?: number;
    creditsRemaining?: number;
  };
};

export type AiCreditGuardAllow = {
  ok: true;
  consumedCredit?: boolean;
  creditsRemaining?: number;
  songsRemaining?: number;
  source: 'trial' | 'credits';
};

export function isMissingUserAiCreditsTable(message: string): boolean {
  return /relation|does not exist|schema cache/i.test(message) && /user_ai_credits/i.test(message);
}

function isMissingUserAiCreditTransactionsTable(message: string): boolean {
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /user_ai_credit_transactions/i.test(message)
  );
}

export async function fetchUserAiCreditsRow(
  client: SupabaseClient,
  userId: string,
): Promise<{ row: UserAiCreditsRow | null; error: string | null; missingTable: boolean }> {
  const { data, error } = await client
    .from('user_ai_credits')
    .select('user_id, credits_remaining, credits_lifetime_granted, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      row: null,
      error: error.message,
      missingTable: isMissingUserAiCreditsTable(error.message),
    };
  }
  return { row: (data as UserAiCreditsRow | null) ?? null, error: null, missingTable: false };
}

export function composeAiTrialStatus(
  trialRow: {
    songs_granted: number;
    songs_remaining: number;
    at_questions_granted: number;
    at_questions_remaining: number;
  } | null,
  creditsRemaining: number,
): AiTrialStatus {
  const songsRemaining = trialRow
    ? Math.max(0, Number(trialRow.songs_remaining) || 0)
    : 0;
  const creditsEnabled = isAiCreditsEnabled();
  const credits = creditsEnabled ? Math.max(0, normalizeAiCreditAmount(creditsRemaining)) : 0;

  const phase: AiTrialPhase = trialRow
    ? resolveTrialPhaseFromEntitlement({ songsRemaining, creditsEnabled, creditsRemaining: credits })
    : credits > 0 && creditsEnabled
      ? 'credits_active'
      : 'trial_exhausted';

  return {
    phase,
    songsGranted: trialRow ? Number(trialRow.songs_granted) || AI_TRIAL_SONGS_GRANTED : AI_TRIAL_SONGS_GRANTED,
    songsRemaining,
    atQuestionsGranted: trialRow
      ? Number(trialRow.at_questions_granted) || AI_TRIAL_AT_QUESTIONS_GRANTED
      : AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: trialRow
      ? Math.max(0, Number(trialRow.at_questions_remaining) || 0)
      : 0,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    creditsEnabled,
    creditsRemaining: credits,
  };
}

export async function loadComposedAiTrialStatus(
  admin: SupabaseClient,
  trialRow: UserAiTrialRow | null,
  userId: string,
): Promise<AiTrialStatus> {
  if (!isAiCreditsEnabled()) {
    if (!trialRow) {
      return composeAiTrialStatus(null, 0);
    }
    return rowToAiTrialStatus(trialRow);
  }
  const credits = await fetchUserAiCreditsRow(admin, userId);
  if (credits.missingTable) {
    if (!trialRow) {
      return composeAiTrialStatus(null, 0);
    }
    return rowToAiTrialStatus(trialRow);
  }
  const remaining = credits.row
    ? Math.max(0, normalizeAiCreditAmount(credits.row.credits_remaining))
    : 0;
  return composeAiTrialStatus(trialRow, remaining);
}

async function insertCreditTransaction(
  admin: SupabaseClient,
  params: {
    userId: string;
    kind: AiCreditTransactionKind;
    delta: number;
    balanceAfter: number;
    note?: string;
    grantedBy?: string;
    roomId?: string;
    videoId?: string;
    clientIp?: string;
  },
): Promise<void> {
  const { error } = await admin.from('user_ai_credit_transactions').insert({
    user_id: params.userId,
    kind: params.kind,
    delta: params.delta,
    balance_after: params.balanceAfter,
    note: params.note?.trim() || null,
    granted_by: params.grantedBy?.trim() || null,
    room_id: params.roomId?.trim() || null,
    video_id: params.videoId?.trim() || null,
    client_ip: params.clientIp?.trim() || null,
  });
  if (error && !isMissingUserAiCreditTransactionsTable(error.message)) {
    console.error('[user-ai-credits] transaction insert', error.message);
  }
}

export async function grantAiCreditsAdmin(params: {
  targetUserId: string;
  credits: number;
  note?: string;
  grantedByUserId: string;
}): Promise<
  | { ok: true; row: UserAiCreditsRow }
  | { ok: false; error: string; missingTable?: boolean }
> {
  const amount = Math.floor(params.credits);
  if (amount <= 0) {
    return { ok: false, error: 'credits_must_be_positive' };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: 'admin_not_configured' };
  }

  const existing = await fetchUserAiCreditsRow(admin, params.targetUserId);
  if (existing.missingTable) {
    return { ok: false, error: existing.error ?? 'missing_table', missingTable: true };
  }
  if (existing.error) {
    return { ok: false, error: existing.error };
  }

  const now = new Date().toISOString();

  if (!existing.row) {
    const { data, error } = await admin
      .from('user_ai_credits')
      .insert({
        user_id: params.targetUserId,
        credits_remaining: amount,
        credits_lifetime_granted: amount,
        updated_at: now,
      })
      .select('user_id, credits_remaining, credits_lifetime_granted, created_at, updated_at')
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: error.message,
        missingTable: isMissingUserAiCreditsTable(error.message),
      };
    }
    const row = data as UserAiCreditsRow;
    await insertCreditTransaction(admin, {
      userId: params.targetUserId,
      kind: 'grant_admin',
      delta: amount,
      balanceAfter: row.credits_remaining,
      note: params.note,
      grantedBy: params.grantedByUserId,
    });
    return { ok: true, row };
  }

  const prev = existing.row.credits_remaining;
  const next = prev + amount;
  const lifetime = existing.row.credits_lifetime_granted + amount;

  const { data, error } = await admin
    .from('user_ai_credits')
    .update({
      credits_remaining: next,
      credits_lifetime_granted: lifetime,
      updated_at: now,
    })
    .eq('user_id', params.targetUserId)
    .eq('credits_remaining', prev)
    .select('user_id, credits_remaining, credits_lifetime_granted, created_at, updated_at')
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'grant_update_failed' };
  }

  const row = data as UserAiCreditsRow;
  await insertCreditTransaction(admin, {
    userId: params.targetUserId,
    kind: 'grant_admin',
    delta: amount,
    balanceAfter: row.credits_remaining,
    note: params.note,
    grantedBy: params.grantedByUserId,
  });

  return { ok: true, row };
}

function creditsDenied(
  error: string,
  message: string,
  status = 403,
  extra?: { creditsRemaining?: number; songsRemaining?: number; atQuestionsRemaining?: number },
): AiCreditGuardDeny {
  return { ok: false, status, body: { error, message, ...extra } };
}

export async function consumeAiCredit(params: {
  userId: string;
  cost: number;
  kind: 'consume_song' | 'consume_at_question';
  clientIp?: string;
  roomId?: string;
  videoId?: string;
}): Promise<AiCreditGuardAllow | AiCreditGuardDeny> {
  if (!isAiCreditsEnabled()) {
    return creditsDenied('credits_disabled', 'クレジット機能は有効になっていません。', 503);
  }

  const admin = createAdminClient();
  if (!admin) {
    return creditsDenied('credits_unavailable', 'クレジット残高の確認に失敗しました。', 503);
  }

  const cost = normalizeAiCreditAmount(params.cost);
  if (!(cost > 0)) {
    return creditsDenied('credits_invalid_cost', 'クレジット消費量が不正です。', 400);
  }
  const { row, missingTable, error } = await fetchUserAiCreditsRow(admin, params.userId);
  if (missingTable) {
    return creditsDenied(
      'credits_table_missing',
      'クレジット残高テーブルが未作成です。管理者にお問い合わせください。',
      503,
    );
  }
  if (error) {
    return creditsDenied('credits_load_failed', 'クレジット残高の取得に失敗しました。', 500);
  }
  const remaining = normalizeAiCreditAmount(row?.credits_remaining ?? 0);
  if (!row || remaining < cost) {
    return creditsDenied(
      'credits_exhausted',
      'AI クレジットが不足しています。チャージ後に AI 付き選曲・@ 質問がご利用いただけます。',
      403,
      { creditsRemaining: remaining },
    );
  }

  const prev = remaining;
  const next = normalizeAiCreditAmount(prev - cost);
  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await admin
    .from('user_ai_credits')
    .update({ credits_remaining: next, updated_at: now })
    .eq('user_id', params.userId)
    .eq('credits_remaining', prev)
    .select('credits_remaining')
    .maybeSingle();

  if (updateErr || !updated) {
    const retry = await fetchUserAiCreditsRow(admin, params.userId);
    const retryRemaining = normalizeAiCreditAmount(retry.row?.credits_remaining ?? 0);
    if (!retry.row || retryRemaining < cost) {
      return creditsDenied(
        'credits_exhausted',
        'AI クレジットが不足しています。',
        403,
        { creditsRemaining: retryRemaining },
      );
    }
    return creditsDenied('credits_consume_failed', 'クレジットの消費に失敗しました。', 409);
  }

  const balanceAfter = Math.max(0, normalizeAiCreditAmount(Number(updated.credits_remaining) || 0));
  await insertCreditTransaction(admin, {
    userId: params.userId,
    kind: params.kind,
    delta: -cost,
    balanceAfter,
    roomId: params.roomId,
    videoId: params.videoId,
    clientIp: params.clientIp,
  });

  return {
    ok: true,
    consumedCredit: true,
    creditsRemaining: balanceAfter,
    source: 'credits',
  };
}

export async function guardConsumeAiCreditSong(params: {
  user: User;
  clientIp?: string;
  roomId?: string;
  videoId?: string;
}): Promise<AiCreditGuardAllow | AiCreditGuardDeny> {
  return consumeAiCredit({
    userId: params.user.id,
    cost: AI_CREDIT_COST_PER_SONG,
    kind: 'consume_song',
    clientIp: params.clientIp,
    roomId: params.roomId,
    videoId: params.videoId,
  });
}

export async function guardConsumeAiCreditAtQuestion(params: {
  user: User;
  clientIp?: string;
}): Promise<AiCreditGuardAllow | AiCreditGuardDeny> {
  return consumeAiCredit({
    userId: params.user.id,
    cost: AI_CREDIT_COST_PER_AT_QUESTION,
    kind: 'consume_at_question',
    clientIp: params.clientIp,
  });
}

export type AdminAiCreditTransactionRow = {
  id: string;
  kind: AiCreditTransactionKind;
  delta: number;
  balanceAfter: number;
  note: string | null;
  grantedBy: string | null;
  roomId: string | null;
  videoId: string | null;
  clientIp: string | null;
  createdAt: string;
};

export async function listAiCreditTransactions(
  admin: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<{ rows: AdminAiCreditTransactionRow[]; missingTable: boolean; error: string | null }> {
  const { data, error } = await admin
    .from('user_ai_credit_transactions')
    .select(
      'id, kind, delta, balance_after, note, granted_by, room_id, video_id, client_ip, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingUserAiCreditTransactionsTable(error.message)) {
      return { rows: [], missingTable: true, error: null };
    }
    return { rows: [], missingTable: false, error: error.message };
  }

  return {
    rows: (data ?? []).map((row) => ({
      id: String(row.id),
      kind: row.kind as AiCreditTransactionKind,
      delta: Number(row.delta) || 0,
      balanceAfter: Number(row.balance_after) || 0,
      note: typeof row.note === 'string' ? row.note : null,
      grantedBy: typeof row.granted_by === 'string' ? row.granted_by : null,
      roomId: typeof row.room_id === 'string' ? row.room_id : null,
      videoId: typeof row.video_id === 'string' ? row.video_id : null,
      clientIp: typeof row.client_ip === 'string' ? row.client_ip : null,
      createdAt: String(row.created_at),
    })),
    missingTable: false,
    error: null,
  };
}
