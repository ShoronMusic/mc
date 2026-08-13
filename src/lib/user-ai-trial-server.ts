import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AI_TRIAL_AT_QUESTIONS_GRANTED,
  AI_TRIAL_SONGS_GRANTED,
  isAiTrialEnforcementEnabled,
  type AiTrialStatus,
} from '@/lib/ai-trial-status';
import { isUserEmailConfirmed, requiresEmailConfirmation } from '@/lib/supabase-email-auth';
import type { AiSelectionMode } from '@/lib/ai-selection-mode';
import { parseAiSelectionMode } from '@/lib/ai-selection-mode';
import { isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';
import { isAiCreditsEnabled } from '@/lib/ai-credits-config';
import {
  fetchUserAiCreditsRow,
  guardConsumeAiCreditAtQuestion,
  guardConsumeAiCreditSong,
  type AiCreditGuardDeny,
} from '@/lib/user-ai-credits-server';
import {
  evaluateAiTrialGrantEligibility,
  recordAiTrialAbuseEvent,
  type AiTrialGrantEligibility,
} from '@/lib/ai-trial-abuse-guard';

export type UserAiTrialRow = {
  user_id: string;
  songs_granted: number;
  songs_remaining: number;
  at_questions_granted: number;
  at_questions_remaining: number;
  first_ip: string | null;
  last_ip: string | null;
  email_verified_at_grant: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToAiTrialStatus(row: {
  songs_granted: number;
  songs_remaining: number;
  at_questions_granted: number;
  at_questions_remaining: number;
}): AiTrialStatus {
  const songsRemaining = Math.max(0, Number(row.songs_remaining) || 0);
  return {
    phase: songsRemaining > 0 ? 'trial_active' : 'trial_exhausted',
    songsGranted: Number(row.songs_granted) || AI_TRIAL_SONGS_GRANTED,
    songsRemaining,
    atQuestionsGranted: Number(row.at_questions_granted) || AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: Math.max(0, Number(row.at_questions_remaining) || 0),
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    creditsEnabled: false,
    creditsRemaining: 0,
  };
}

export function isMissingUserAiTrialTable(message: string): boolean {
  return /relation|does not exist|schema cache/i.test(message) && /user_ai_trial/i.test(message);
}

function isMissingUserAiTrialConsumptionLogTable(message: string): boolean {
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /user_ai_trial_consumption_log/i.test(message)
  );
}

export type AiTrialConsumptionKind = 'song_full' | 'at_question';

/** 消費成功時の監査ログ（テーブル未作成時は無視） */
async function insertAiTrialConsumptionLog(
  admin: SupabaseClient,
  params: {
    userId: string;
    kind: AiTrialConsumptionKind;
    clientIp?: string;
    roomId?: string;
    videoId?: string;
  },
): Promise<void> {
  const { error } = await admin.from('user_ai_trial_consumption_log').insert({
    user_id: params.userId,
    kind: params.kind,
    room_id: params.roomId?.trim() || null,
    video_id: params.videoId?.trim() || null,
    client_ip: params.clientIp?.trim() || null,
  });
  if (error && !isMissingUserAiTrialConsumptionLogTable(error.message)) {
    console.error('[user-ai-trial] consumption_log insert', error.message);
  }
}

export async function fetchUserAiTrialRow(
  client: SupabaseClient,
  userId: string,
): Promise<{ row: UserAiTrialRow | null; error: string | null; missingTable: boolean }> {
  const { data, error } = await client
    .from('user_ai_trial')
    .select(
      'user_id, songs_granted, songs_remaining, at_questions_granted, at_questions_remaining, first_ip, last_ip, email_verified_at_grant, created_at, updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      row: null,
      error: error.message,
      missingTable: isMissingUserAiTrialTable(error.message),
    };
  }
  return { row: (data as UserAiTrialRow | null) ?? null, error: null, missingTable: false };
}

/**
 * 既付与が現行定数より少ないとき、差分を残数に加算して songs_granted を揃える。
 * 例: 10付与・残3 → 20付与・残13（使用済み7は維持）
 */
export function computeTrialSongsGrantBump(
  row: { songs_granted: number; songs_remaining: number },
  targetGranted: number = AI_TRIAL_SONGS_GRANTED,
): { songs_granted: number; songs_remaining: number } | null {
  const granted = Math.max(0, Math.floor(Number(row.songs_granted) || 0));
  const remaining = Math.max(0, Math.floor(Number(row.songs_remaining) || 0));
  if (granted >= targetGranted) return null;
  const delta = targetGranted - granted;
  return {
    songs_granted: targetGranted,
    songs_remaining: remaining + delta,
  };
}

export async function bumpExistingTrialSongsIfNeeded(
  admin: SupabaseClient,
  row: UserAiTrialRow,
): Promise<{ row: UserAiTrialRow; error: string | null }> {
  const bump = computeTrialSongsGrantBump(row);
  if (!bump) return { row, error: null };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('user_ai_trial')
    .update({
      songs_granted: bump.songs_granted,
      songs_remaining: bump.songs_remaining,
      updated_at: now,
    })
    .eq('user_id', row.user_id)
    .eq('songs_granted', row.songs_granted)
    .select(
      'user_id, songs_granted, songs_remaining, at_questions_granted, at_questions_remaining, first_ip, last_ip, email_verified_at_grant, created_at, updated_at',
    )
    .maybeSingle();

  if (error) {
    return { row, error: error.message };
  }
  if (data) {
    return { row: data as UserAiTrialRow, error: null };
  }
  const retry = await fetchUserAiTrialRow(admin, row.user_id);
  return { row: retry.row ?? row, error: retry.error };
}

export type EnsureUserAiTrialGrantResult = {
  row: UserAiTrialRow | null;
  error: string | null;
  missingTable: boolean;
  /** 新規付与が拒否されたときの理由（既存行がある場合は付かない） */
  eligibility?: AiTrialGrantEligibility;
};

function grantBlockMessage(eligibility: Extract<AiTrialGrantEligibility, { ok: false }>): string {
  return eligibility.message;
}

/** 付与資格のみ（INSERT しない）。GET 表示・consume:false ガード用 */
export async function peekUserAiTrialGrantEligibility(
  user: User,
  clientIp?: string,
): Promise<{
  missingTable: boolean;
  error: string | null;
  hasRow: boolean;
  row: UserAiTrialRow | null;
  eligibility: AiTrialGrantEligibility;
}> {
  if (!isUserEmailConfirmed(user)) {
    return {
      missingTable: false,
      error: null,
      hasRow: false,
      row: null,
      eligibility: {
        ok: false,
        reason: 'email_unconfirmed',
        message: 'メールアドレスの確認が完了すると、AI お試し枠が付与されます。',
      },
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      missingTable: false,
      error: 'admin_not_configured',
      hasRow: false,
      row: null,
      eligibility: { ok: true },
    };
  }

  const existing = await fetchUserAiTrialRow(admin, user.id);
  if (existing.missingTable) {
    return {
      missingTable: true,
      error: existing.error,
      hasRow: false,
      row: null,
      eligibility: { ok: true },
    };
  }
  if (existing.error) {
    return {
      missingTable: false,
      error: existing.error,
      hasRow: false,
      row: null,
      eligibility: { ok: true },
    };
  }
  if (existing.row) {
    return {
      missingTable: false,
      error: null,
      hasRow: true,
      row: existing.row,
      eligibility: { ok: true },
    };
  }

  const eligibility = await evaluateAiTrialGrantEligibility({
    admin,
    user,
    clientIp,
  });
  return {
    missingTable: false,
    error: null,
    hasRow: false,
    row: null,
    eligibility,
  };
}

/**
 * メール確認済みユーザーに初回付与。既存で付与が定数未満なら差分を加算して揃える。
 * 新規 INSERT 前に IP ソフト上限・メール待機を検査する。
 */
export async function ensureUserAiTrialGrant(
  user: User,
  clientIp?: string,
): Promise<EnsureUserAiTrialGrantResult> {
  if (!isUserEmailConfirmed(user)) {
    return { row: null, error: 'email_unconfirmed', missingTable: false };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { row: null, error: 'admin_not_configured', missingTable: false };
  }

  const existing = await fetchUserAiTrialRow(admin, user.id);
  if (existing.missingTable) return existing;
  if (existing.error) return { row: null, error: existing.error, missingTable: false };
  if (existing.row) {
    const bumped = await bumpExistingTrialSongsIfNeeded(admin, existing.row);
    if (bumped.error) {
      console.error('[user-ai-trial] songs grant bump', bumped.error);
    }
    return { row: bumped.row, error: null, missingTable: false };
  }

  const eligibility = await evaluateAiTrialGrantEligibility({
    admin,
    user,
    clientIp,
  });
  if (!eligibility.ok) {
    if (eligibility.reason === 'ip_soft_cap' || eligibility.reason === 'email_min_age') {
      void recordAiTrialAbuseEvent(admin, {
        kind: eligibility.reason,
        userId: user.id,
        clientIp,
        detail: {
          reason: eligibility.reason,
          ipKey: 'ipKey' in eligibility ? eligibility.ipKey : undefined,
          grantCountInWindow:
            'grantCountInWindow' in eligibility ? eligibility.grantCountInWindow : undefined,
          softCap: 'softCap' in eligibility ? eligibility.softCap : undefined,
          retryAfterMinutes:
            'retryAfterMinutes' in eligibility ? eligibility.retryAfterMinutes : undefined,
        },
      });
    }
    return {
      row: null,
      error: eligibility.reason,
      missingTable: false,
      eligibility,
    };
  }

  const now = new Date().toISOString();
  const ip = clientIp?.trim() || null;
  const { data, error } = await admin
    .from('user_ai_trial')
    .insert({
      user_id: user.id,
      songs_granted: AI_TRIAL_SONGS_GRANTED,
      songs_remaining: AI_TRIAL_SONGS_GRANTED,
      at_questions_granted: AI_TRIAL_AT_QUESTIONS_GRANTED,
      at_questions_remaining: AI_TRIAL_AT_QUESTIONS_GRANTED,
      first_ip: ip,
      last_ip: ip,
      email_verified_at_grant: user.email_confirmed_at ?? now,
      updated_at: now,
    })
    .select(
      'user_id, songs_granted, songs_remaining, at_questions_granted, at_questions_remaining, first_ip, last_ip, email_verified_at_grant, created_at, updated_at',
    )
    .maybeSingle();

  if (error) {
    if (isMissingUserAiTrialTable(error.message)) {
      return { row: null, error: error.message, missingTable: true };
    }
    if (error.code === '23505') {
      const retry = await fetchUserAiTrialRow(admin, user.id);
      if (retry.row) {
        const bumped = await bumpExistingTrialSongsIfNeeded(admin, retry.row);
        return { row: bumped.row, error: bumped.error ?? retry.error, missingTable: retry.missingTable };
      }
      return { row: retry.row, error: retry.error, missingTable: retry.missingTable };
    }
    return { row: null, error: error.message, missingTable: false };
  }

  return { row: (data as UserAiTrialRow | null) ?? null, error: null, missingTable: false };
}

export type AiTrialGuardDeny = {
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

export type AiTrialGuardAllow = {
  ok: true;
  consumedSong?: boolean;
  consumedCredit?: boolean;
  songsRemaining?: number;
  creditsRemaining?: number;
  source?: 'trial' | 'credits';
};

function creditDenyToTrialDeny(deny: AiCreditGuardDeny): AiTrialGuardDeny {
  return { ok: false, status: deny.status, body: deny.body };
}

async function consumeSongFromCreditsOrDeny(params: {
  user: User;
  clientIp?: string;
  packPhase?: 'base' | 'frees' | null;
  roomId?: string;
  videoId?: string;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (!isAiCreditsEnabled()) {
    return trialDenied(
      'trial_exhausted',
      'AI お試しを使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
      403,
      { songsRemaining: 0 },
    );
  }

  if (params.packPhase === 'base') {
    const credit = await guardConsumeAiCreditSong({
      user: params.user,
      clientIp: params.clientIp,
      roomId: params.roomId,
      videoId: params.videoId,
    });
    if (credit.ok) {
      return {
        ok: true,
        consumedSong: true,
        consumedCredit: true,
        creditsRemaining: credit.creditsRemaining,
        source: 'credits',
      };
    }
    return creditDenyToTrialDeny(credit);
  }

  const admin = createAdminClient();
  if (!admin) {
    return trialDenied('trial_unavailable', 'AI お試しの確認に失敗しました。', 503);
  }
  const credits = await fetchUserAiCreditsRow(admin, params.user.id);
  if (credits.missingTable) {
    return trialDenied(
      'trial_exhausted',
      'AI お試しを使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
      403,
      { songsRemaining: 0 },
    );
  }
  const remaining = Math.max(0, credits.row?.credits_remaining ?? 0);
  if (remaining <= 0) {
    return trialDenied(
      'credits_exhausted',
      'AI クレジットが不足しています。チャージ後に AI 付き選曲がご利用いただけます。',
      403,
      { creditsRemaining: 0, songsRemaining: 0 },
    );
  }
  return { ok: true, creditsRemaining: remaining, source: 'credits' };
}

function trialDenied(
  error: string,
  message: string,
  status = 403,
  extra?: { songsRemaining?: number; atQuestionsRemaining?: number; creditsRemaining?: number },
): AiTrialGuardDeny {
  return { ok: false, status, body: { error, message, ...extra } };
}

function denyFromGrantEligibility(
  eligibility: Extract<AiTrialGrantEligibility, { ok: false }>,
): AiTrialGuardDeny {
  return trialDenied(eligibility.reason, grantBlockMessage(eligibility), 403, {
    songsRemaining: 0,
  });
}

/**
 * 選曲付随 AI。
 * - packPhase=frees: 直前の base 消費済み前提で枠残のみ検証（消費しない）
 * - packPhase=base / 省略（一括生成）: 既定では 1 曲分を消費（後方互換）
 * - consume: false で残数チェックのみ（成功後に commitAiTrialSongSelection すること）
 * - 未付与かつ consume:false のときは INSERT せず資格のみ確認（付与は commit / 即時消費時）
 * - user_ai_trial テーブル欠落時は fail-closed（枠なし生成を防ぐ）
 */
export async function guardAiTrialSongSelection(params: {
  user: User | null | undefined;
  isGuest: boolean;
  aiModeRaw: unknown;
  packPhase?: 'base' | 'frees' | null;
  clientIp?: string;
  /**
   * false: 消費しない（残数・資格のみ）。
   * 省略時: packPhase=frees なら false、それ以外は true（従来どおり即時消費）。
   */
  consume?: boolean;
  roomId?: string;
  videoId?: string;
  /**
   * 特集ページの AI 無料（サーバーで検証済み）。
   * ログイン・メール確認・aiMode=full のみ見て、残枠・クレジットは不問。
   */
  promoAiFree?: boolean;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (params.user?.id && isAiUnlimitedUserId(params.user.id)) {
    return { ok: true };
  }

  if (!isAiTrialEnforcementEnabled()) {
    return { ok: true };
  }

  const aiMode: AiSelectionMode = parseAiSelectionMode(params.aiModeRaw) ?? 'none';
  if (params.isGuest || !params.user?.id) {
    return trialDenied(
      'ai_trial_login_required',
      'AI 付き選曲は登録ユーザーのお試し枠が必要です。アカウント登録後、メール確認が完了するとお試しいただけます。',
    );
  }

  if (requiresEmailConfirmation(params.user)) {
    return trialDenied(
      'email_unconfirmed',
      `メールアドレスの確認が完了すると、AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲が使えます。今は選曲のみ（AI なし）でご参加ください。`,
    );
  }

  if (aiMode !== 'full') {
    return trialDenied('ai_mode_none', 'この選曲は AI なしモードです。');
  }

  if (params.promoAiFree === true) {
    return { ok: true, source: 'trial' };
  }

  const admin = createAdminClient();
  if (!admin) {
    return trialDenied('trial_unavailable', 'AI お試しの確認に失敗しました。', 503);
  }

  const shouldConsumeSong =
    params.consume === false ? false : params.consume === true ? true : params.packPhase !== 'frees';
  /** credits 側も同一判定に揃える */
  const consumePhase: 'base' | 'frees' | null = shouldConsumeSong ? 'base' : 'frees';

  if (!shouldConsumeSong) {
    const peek = await peekUserAiTrialGrantEligibility(params.user, params.clientIp);
    if (peek.missingTable) {
      return trialDenied(
        'trial_unavailable',
        'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
        503,
      );
    }
    if (peek.error && !peek.hasRow) {
      return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
    }
    if (!peek.hasRow) {
      if (!peek.eligibility.ok) {
        return denyFromGrantEligibility(peek.eligibility);
      }
      return {
        ok: true,
        songsRemaining: AI_TRIAL_SONGS_GRANTED,
        source: 'trial',
      };
    }
    const row = peek.row!;
    if (row.songs_remaining <= 0) {
      return consumeSongFromCreditsOrDeny({
        user: params.user,
        clientIp: params.clientIp,
        packPhase: consumePhase,
        roomId: params.roomId,
        videoId: params.videoId,
      });
    }
    return { ok: true, songsRemaining: row.songs_remaining, source: 'trial' };
  }

  const grant = await ensureUserAiTrialGrant(params.user, params.clientIp);
  if (grant.missingTable) {
    return trialDenied(
      'trial_unavailable',
      'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
      503,
    );
  }
  if (grant.eligibility && !grant.eligibility.ok) {
    return denyFromGrantEligibility(grant.eligibility);
  }
  if (grant.error && !grant.row) {
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }
  if (!grant.row) {
    return trialDenied('trial_not_granted', 'AI お試し枠が付与されていません。', 403);
  }

  const row = grant.row;
  if (row.songs_remaining <= 0) {
    return consumeSongFromCreditsOrDeny({
      user: params.user,
      clientIp: params.clientIp,
      packPhase: consumePhase,
      roomId: params.roomId,
      videoId: params.videoId,
    });
  }
  return consumeAiTrialSong(admin, params.user.id, params.clientIp, {
    roomId: params.roomId,
    videoId: params.videoId,
  });
}

/**
 * comment-pack / commentary が本文返却に成功したあとに呼ぶ 1 曲分の確定消費。
 * 未付与ならここで付与してから消費する（初回実利用時付与）。
 * 無制限ユーザー・enforcement OFF では no-op。
 */
export async function commitAiTrialSongSelection(params: {
  user: User | null | undefined;
  clientIp?: string;
  roomId?: string;
  videoId?: string;
  /** 特集 AI 無料（検証済み）。消費しない。 */
  promoAiFree?: boolean;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (params.user?.id && isAiUnlimitedUserId(params.user.id)) {
    return { ok: true };
  }
  if (!isAiTrialEnforcementEnabled()) {
    return { ok: true };
  }
  if (params.promoAiFree === true) {
    return { ok: true };
  }
  if (!params.user?.id) {
    return trialDenied(
      'ai_trial_login_required',
      'AI 付き選曲は登録ユーザーのお試し枠が必要です。アカウント登録後、メール確認が完了するとお試しいただけます。',
    );
  }
  if (requiresEmailConfirmation(params.user)) {
    return trialDenied(
      'email_unconfirmed',
      `メールアドレスの確認が完了すると、AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲が使えます。今は選曲のみ（AI なし）でご参加ください。`,
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return trialDenied('trial_unavailable', 'AI お試しの確認に失敗しました。', 503);
  }

  let { row, missingTable, error } = await fetchUserAiTrialRow(admin, params.user.id);
  if (missingTable) {
    return trialDenied(
      'trial_unavailable',
      'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
      503,
    );
  }
  if (error) {
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }
  if (!row) {
    const grant = await ensureUserAiTrialGrant(params.user, params.clientIp);
    if (grant.missingTable) {
      return trialDenied(
        'trial_unavailable',
        'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
        503,
      );
    }
    if (grant.eligibility && !grant.eligibility.ok) {
      return denyFromGrantEligibility(grant.eligibility);
    }
    if (grant.error || !grant.row) {
      return trialDenied(
        grant.error === 'email_unconfirmed' ? 'email_unconfirmed' : 'trial_not_granted',
        grant.eligibility && !grant.eligibility.ok
          ? grantBlockMessage(grant.eligibility)
          : 'AI お試し枠が付与されていません。',
        403,
      );
    }
    row = grant.row;
  }

  if (row.songs_remaining <= 0) {
    return consumeSongFromCreditsOrDeny({
      user: params.user,
      clientIp: params.clientIp,
      packPhase: 'base',
      roomId: params.roomId,
      videoId: params.videoId,
    });
  }
  return consumeAiTrialSong(admin, params.user.id, params.clientIp, {
    roomId: params.roomId,
    videoId: params.videoId,
  });
}

async function consumeAiTrialSong(
  admin: SupabaseClient,
  userId: string,
  clientIp?: string,
  meta?: { roomId?: string; videoId?: string },
): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  const { row, error, missingTable } = await fetchUserAiTrialRow(admin, userId);
  if (missingTable) {
    return trialDenied(
      'trial_unavailable',
      'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
      503,
    );
  }
  if (error || !row) {
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }
  if (row.songs_remaining <= 0) {
    return trialDenied(
      'trial_exhausted',
      'AI お試しを使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
      403,
      { songsRemaining: 0 },
    );
  }

  const prev = row.songs_remaining;
  const now = new Date().toISOString();
  const ip = clientIp?.trim() || null;
  const { data: updated, error: updateErr } = await admin
    .from('user_ai_trial')
    .update({
      songs_remaining: prev - 1,
      updated_at: now,
      ...(ip ? { last_ip: ip } : {}),
    })
    .eq('user_id', userId)
    .eq('songs_remaining', prev)
    .select('songs_remaining')
    .maybeSingle();

  if (updateErr || !updated) {
    const retry = await fetchUserAiTrialRow(admin, userId);
    if (retry.row && retry.row.songs_remaining <= 0) {
      return trialDenied(
        'trial_exhausted',
        'AI お試しを使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
        403,
        { songsRemaining: 0 },
      );
    }
    return trialDenied('trial_consume_failed', 'AI お試し枠の消費に失敗しました。', 409);
  }

  void insertAiTrialConsumptionLog(admin, {
    userId,
    kind: 'song_full',
    clientIp,
    roomId: meta?.roomId,
    videoId: meta?.videoId,
  });

  return {
    ok: true,
    consumedSong: true,
    songsRemaining: Math.max(0, Number(updated.songs_remaining) || 0),
    source: 'trial',
  };
}

/** @ 質問（AI メンション時） */
export async function guardAndConsumeAiTrialAtQuestion(params: {
  user: User | null | undefined;
  isGuest: boolean;
  clientIp?: string;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (params.user?.id && isAiUnlimitedUserId(params.user.id)) {
    return { ok: true };
  }

  if (!isAiTrialEnforcementEnabled()) {
    return { ok: true };
  }

  if (params.isGuest || !params.user?.id) {
    return trialDenied(
      'ai_trial_login_required',
      'AI への質問は登録ユーザー向けです。アカウント登録後、お試し枠が使えます。',
    );
  }

  if (requiresEmailConfirmation(params.user)) {
    return trialDenied(
      'email_unconfirmed',
      'メール確認後に AI への質問（お試し @ 5 回）が使えます。',
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return trialDenied('trial_unavailable', 'AI お試しの確認に失敗しました。', 503);
  }

  let { row, missingTable, error } = await fetchUserAiTrialRow(admin, params.user.id);
  if (missingTable) {
    return trialDenied(
      'trial_unavailable',
      'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
      503,
    );
  }
  if (!row || (row.songs_granted < AI_TRIAL_SONGS_GRANTED)) {
    const grant = await ensureUserAiTrialGrant(params.user, params.clientIp);
    if (grant.missingTable) {
      return trialDenied(
        'trial_unavailable',
        'AI お試し枠の確認ができません。しばらくしてから再度お試しください。',
        503,
      );
    }
    if (grant.eligibility && !grant.eligibility.ok) {
      return denyFromGrantEligibility(grant.eligibility);
    }
    row = grant.row;
    error = grant.error;
  }
  if (error || !row) {
    if (
      error === 'ip_soft_cap' ||
      error === 'email_min_age' ||
      error === 'email_unconfirmed'
    ) {
      return trialDenied(
        error,
        error === 'email_unconfirmed'
          ? 'メール確認後に AI への質問（お試し @ 5 回）が使えます。'
          : 'AI お試し枠を付与できませんでした。選曲のみ（AI なし）でご利用ください。',
        403,
      );
    }
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }

  if (row.at_questions_remaining <= 0) {
    if (isAiCreditsEnabled()) {
      const credit = await guardConsumeAiCreditAtQuestion({
        user: params.user,
        clientIp: params.clientIp,
      });
      if (credit.ok) {
        return {
          ok: true,
          consumedCredit: true,
          creditsRemaining: credit.creditsRemaining,
          source: 'credits',
        };
      }
      return creditDenyToTrialDeny(credit);
    }
    return trialDenied(
      'at_trial_exhausted',
      'お試し @ 質問 5 回を使い切りました。',
      403,
      { atQuestionsRemaining: 0 },
    );
  }

  const prev = row.at_questions_remaining;
  const now = new Date().toISOString();
  const ip = params.clientIp?.trim() || null;
  const { data: updated, error: updateErr } = await admin
    .from('user_ai_trial')
    .update({
      at_questions_remaining: prev - 1,
      updated_at: now,
      ...(ip ? { last_ip: ip } : {}),
    })
    .eq('user_id', params.user.id)
    .eq('at_questions_remaining', prev)
    .select('at_questions_remaining')
    .maybeSingle();

  if (updateErr || !updated) {
    return trialDenied('at_consume_failed', '@ 質問枠の消費に失敗しました。', 409);
  }

  void insertAiTrialConsumptionLog(admin, {
    userId: params.user.id,
    kind: 'at_question',
    clientIp: params.clientIp,
  });

  return {
    ok: true,
    consumedSong: false,
    songsRemaining: row.songs_remaining,
    source: 'trial',
  };
}

/** 最新ユーザー文が AI メンションか（chat ガード用） */
export function userTextHasAiMention(userText: string): boolean {
  const t = userText.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  return (
    /(^|[\s、,:：])(ai|ＡＩ|えーあい|エーアイ)([\s、,:：]|$)/i.test(t) ||
    /@ai\b/i.test(lower) ||
    /(ai|ＡＩ|えーあい|エーアイ)に(質問|聞きたい|教えて|相談|確認)/i.test(t) ||
    /(ai|ＡＩ|えーあい|エーアイ)へ(質問|相談|確認)/i.test(t)
  );
}
