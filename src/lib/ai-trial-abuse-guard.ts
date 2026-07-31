/**
 * AI お試し付与の不正抑制（IP ソフト上限・メール経路の最低待機）。
 * `docs/00-ai-trial-and-billing-implementation.md` Phase C。
 */

import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailPasswordUser } from '@/lib/supabase-email-auth';

export type AiTrialGrantBlockReason =
  | 'ip_soft_cap'
  | 'email_min_age'
  | 'email_unconfirmed'
  | 'no_ip';

export type AiTrialGrantEligibility = {
  ok: true;
} | {
  ok: false;
  reason: AiTrialGrantBlockReason;
  message: string;
  /** ソフト上限判定に使ったキー（exact IP または /24 プレフィックス） */
  ipKey?: string;
  /** 窓内の既存付与件数 */
  grantCountInWindow?: number;
  softCap?: number;
  retryAfterMinutes?: number;
};

function parsePositiveIntEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(max, n);
}

/** 同一 IP（または /24）からの新規お試し付与の 24h 上限（OAuth 等）。0 で無効 */
export function getAiTrialIpSoftCapPerDay(): number {
  return parsePositiveIntEnv('AI_TRIAL_IP_SOFT_CAP_PER_DAY', 3, 100);
}

/** メール＋パスワード専用ユーザー向けのより厳しい 24h 上限。0 で無効 */
export function getAiTrialIpSoftCapEmailPerDay(): number {
  return parsePositiveIntEnv('AI_TRIAL_IP_SOFT_CAP_EMAIL_PER_DAY', 1, 100);
}

/** メール確認後、付与可能になるまでの最低分（メール経路のみ）。0 で無効 */
export function getAiTrialEmailGrantMinAgeMinutes(): number {
  return parsePositiveIntEnv('AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES', 15, 24 * 60);
}

/** IPv4 なら /24 プレフィックス（例: 203.0.113.）、それ以外は正規化した全文 */
export function normalizeAiTrialIpKey(ip: string | null | undefined): string | null {
  const raw = (ip ?? '').trim();
  if (!raw || raw === 'unknown') return null;
  const v4 = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = [v4[1], v4[2], v4[3], v4[4]].map((x) => Number(x));
    if (octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.`;
    }
  }
  return raw.toLowerCase();
}

/** first_ip が ipKey（/24 または exact）に一致するか */
export function trialFirstIpMatchesKey(firstIp: string | null | undefined, ipKey: string): boolean {
  const fp = (firstIp ?? '').trim();
  if (!fp || !ipKey) return false;
  if (ipKey.endsWith('.')) {
    const fpKey = normalizeAiTrialIpKey(fp);
    return fpKey === ipKey || fp.startsWith(ipKey);
  }
  return fp.toLowerCase() === ipKey.toLowerCase();
}

export function isAiTrialEmailPasswordPath(user: User): boolean {
  return isEmailPasswordUser(user);
}

export function resolveAiTrialSoftCapForUser(user: User): number {
  if (isAiTrialEmailPasswordPath(user)) {
    return getAiTrialIpSoftCapEmailPerDay();
  }
  return getAiTrialIpSoftCapPerDay();
}

export function checkAiTrialEmailMinAge(user: User, nowMs: number = Date.now()): AiTrialGrantEligibility {
  if (!isAiTrialEmailPasswordPath(user)) {
    return { ok: true };
  }
  const minMinutes = getAiTrialEmailGrantMinAgeMinutes();
  if (minMinutes <= 0) {
    return { ok: true };
  }
  const confirmedAt = user.email_confirmed_at ? Date.parse(user.email_confirmed_at) : NaN;
  if (!Number.isFinite(confirmedAt)) {
    return {
      ok: false,
      reason: 'email_unconfirmed',
      message: 'メールアドレスの確認が完了すると、AI お試し枠が付与されます。',
    };
  }
  const elapsedMs = nowMs - confirmedAt;
  const needMs = minMinutes * 60_000;
  if (elapsedMs >= needMs) {
    return { ok: true };
  }
  const retryAfterMinutes = Math.max(1, Math.ceil((needMs - elapsedMs) / 60_000));
  return {
    ok: false,
    reason: 'email_min_age',
    message: `メール登録の場合、確認完了から約 ${minMinutes} 分後に AI お試し枠が付与されます（あと約 ${retryAfterMinutes} 分）。その間は選曲のみ（AI なし）でご利用ください。`,
    retryAfterMinutes,
  };
}

/**
 * 直近 24h に同一 IP キーで付与された件数を数える（service_role）。
 * テーブル欠落・IP 無しは上限チェックをスキップ（付与側で no_ip を別扱いしない）。
 */
export async function countRecentAiTrialGrantsForIpKey(
  admin: SupabaseClient,
  ipKey: string,
  windowMs: number = 24 * 60 * 60 * 1000,
): Promise<{ count: number; error: string | null; missingTable: boolean }> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await admin
    .from('user_ai_trial')
    .select('user_id, first_ip, created_at')
    .gte('created_at', since)
    .not('first_ip', 'is', null)
    .limit(500);

  if (error) {
    const missing =
      /relation|does not exist|schema cache/i.test(error.message) && /user_ai_trial/i.test(error.message);
    return { count: 0, error: error.message, missingTable: missing };
  }

  const rows = (data ?? []) as Array<{ first_ip?: string | null }>;
  const count = rows.filter((r) => trialFirstIpMatchesKey(r.first_ip, ipKey)).length;
  return { count, error: null, missingTable: false };
}

export async function evaluateAiTrialGrantEligibility(params: {
  admin: SupabaseClient;
  user: User;
  clientIp?: string | null;
  nowMs?: number;
}): Promise<AiTrialGrantEligibility> {
  const age = checkAiTrialEmailMinAge(params.user, params.nowMs);
  if (!age.ok) return age;

  const softCap = resolveAiTrialSoftCapForUser(params.user);
  if (softCap <= 0) {
    return { ok: true };
  }

  const ipKey = normalizeAiTrialIpKey(params.clientIp);
  if (!ipKey) {
    // プロキシ未設定等: 上限はスキップ（記録不能なため）。乱用は別経路で監視。
    return { ok: true };
  }

  const counted = await countRecentAiTrialGrantsForIpKey(params.admin, ipKey);
  if (counted.missingTable) {
    return { ok: true };
  }
  if (counted.error) {
    console.error('[ai-trial-abuse] ip count', counted.error);
    // fail-open: 集計失敗で正規ユーザーを止めない
    return { ok: true };
  }

  if (counted.count >= softCap) {
    return {
      ok: false,
      reason: 'ip_soft_cap',
      ipKey,
      grantCountInWindow: counted.count,
      softCap,
      message:
        '同一ネットワークからのお試し枠の付与が上限に達しています。しばらく経ってから再度お試しいただくか、選曲のみ（AI なし）でご利用ください。ご家族・学校回線など正当な利用でお困りの場合はお問い合わせください。',
    };
  }

  return { ok: true };
}

export type AiTrialAbuseEventKind = 'ip_soft_cap' | 'email_min_age';

function isMissingAbuseEventTable(message: string): boolean {
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /user_ai_trial_abuse_event/i.test(message)
  );
}

/** 管理通知用イベント（テーブル未作成時はサーバーログのみ） */
export async function recordAiTrialAbuseEvent(
  admin: SupabaseClient,
  params: {
    kind: AiTrialAbuseEventKind;
    userId: string;
    clientIp?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  const ip = params.clientIp?.trim() || null;
  console.warn('[ai-trial-abuse]', params.kind, {
    userId: params.userId,
    clientIp: ip,
    ...params.detail,
  });

  const { error } = await admin.from('user_ai_trial_abuse_event').insert({
    kind: params.kind,
    user_id: params.userId,
    client_ip: ip,
    detail: params.detail ?? {},
  });
  if (error && !isMissingAbuseEventTable(error.message)) {
    console.error('[ai-trial-abuse] event insert', error.message);
  }
}
