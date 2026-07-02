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
import { isDeveloperAiUnlimitedUserId } from '@/lib/ai-developer-unlimited-user-ids';

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

/** メール確認済みユーザーに初回付与（既存行はそのまま） */
export async function ensureUserAiTrialGrant(
  user: User,
  clientIp?: string,
): Promise<{ row: UserAiTrialRow | null; error: string | null; missingTable: boolean }> {
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
  if (existing.row) return { row: existing.row, error: null, missingTable: false };

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
  };
};

export type AiTrialGuardAllow = {
  ok: true;
  consumedSong?: boolean;
  songsRemaining?: number;
};

function trialDenied(
  error: string,
  message: string,
  status = 403,
  extra?: { songsRemaining?: number; atQuestionsRemaining?: number },
): AiTrialGuardDeny {
  return { ok: false, status, body: { error, message, ...extra } };
}

/** 選曲付随 AI（comment-pack base で消費、frees 以降は aiMode のみ検証） */
export async function guardAiTrialSongSelection(params: {
  user: User | null | undefined;
  isGuest: boolean;
  aiModeRaw: unknown;
  packPhase?: 'base' | 'frees' | null;
  clientIp?: string;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (params.user?.id && isDeveloperAiUnlimitedUserId(params.user.id)) {
    return { ok: true };
  }

  if (!isAiTrialEnforcementEnabled()) {
    return { ok: true };
  }

  const aiMode: AiSelectionMode = parseAiSelectionMode(params.aiModeRaw) ?? 'none';
  if (params.isGuest || !params.user?.id) {
    return trialDenied(
      'ai_trial_login_required',
      'AI 付き選曲は登録ユーザーのお試し枠が必要です。アカウント登録後、メール確認が完了すると 10 曲お試しいただけます。',
    );
  }

  if (requiresEmailConfirmation(params.user)) {
    return trialDenied(
      'email_unconfirmed',
      'メールアドレスの確認が完了すると、AI お試し 10 曲が使えます。今は選曲のみ（AI なし）でご参加ください。',
    );
  }

  if (aiMode !== 'full') {
    return trialDenied('ai_mode_none', 'この選曲は AI なしモードです。');
  }

  const admin = createAdminClient();
  if (!admin) {
    return trialDenied('trial_unavailable', 'AI お試しの確認に失敗しました。', 503);
  }

  const { row, missingTable, error } = await fetchUserAiTrialRow(admin, params.user.id);
  if (missingTable) return { ok: true };
  if (error) return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);

  if (!row) {
    const grant = await ensureUserAiTrialGrant(params.user, params.clientIp);
    if (grant.missingTable) return { ok: true };
    if (!grant.row) {
      return trialDenied('trial_not_granted', 'AI お試し枠が付与されていません。', 403);
    }
    if (grant.row.songs_remaining <= 0) {
      return trialDenied(
        'trial_exhausted',
        'AI お試し 10 曲を使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
        403,
        { songsRemaining: 0 },
      );
    }
    if (params.packPhase === 'base') {
      return consumeAiTrialSong(admin, params.user.id, params.clientIp);
    }
    return { ok: true, songsRemaining: grant.row.songs_remaining };
  }

  if (params.packPhase === 'base') {
    if (row.songs_remaining <= 0) {
      return trialDenied(
        'trial_exhausted',
        'AI お試し 10 曲を使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
        403,
        { songsRemaining: 0 },
      );
    }
    return consumeAiTrialSong(admin, params.user.id, params.clientIp);
  }

  return { ok: true, songsRemaining: row.songs_remaining };
}

async function consumeAiTrialSong(
  admin: SupabaseClient,
  userId: string,
  clientIp?: string,
): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  const { row, error, missingTable } = await fetchUserAiTrialRow(admin, userId);
  if (missingTable) return { ok: true };
  if (error || !row) {
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }
  if (row.songs_remaining <= 0) {
    return trialDenied(
      'trial_exhausted',
      'AI お試し 10 曲を使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
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
        'AI お試し 10 曲を使い切りました。選曲・再生・チャットは無料のままご利用いただけます。',
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
  });

  return {
    ok: true,
    consumedSong: true,
    songsRemaining: Math.max(0, Number(updated.songs_remaining) || 0),
  };
}

/** @ 質問（AI メンション時） */
export async function guardAndConsumeAiTrialAtQuestion(params: {
  user: User | null | undefined;
  isGuest: boolean;
  clientIp?: string;
}): Promise<AiTrialGuardAllow | AiTrialGuardDeny> {
  if (params.user?.id && isDeveloperAiUnlimitedUserId(params.user.id)) {
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
  if (missingTable) return { ok: true };
  if (!row) {
    const grant = await ensureUserAiTrialGrant(params.user, params.clientIp);
    if (grant.missingTable) return { ok: true };
    row = grant.row;
    error = grant.error;
  }
  if (error || !row) {
    return trialDenied('trial_load_failed', 'AI お試し残数の取得に失敗しました。', 500);
  }

  if (row.at_questions_remaining <= 0) {
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
