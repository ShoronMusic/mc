/** 登録ユーザー向け AI お試し（`docs/00-ai-trial-and-billing-implementation.md`） */

import { formatAiCreditAmount } from '@/lib/ai-credits-config';

/** 初回付与: AI 付き選曲（1曲＝1消費。有料クレジットと同単位） */
export const AI_TRIAL_SONGS_GRANTED = 20;
export const AI_TRIAL_AT_QUESTIONS_GRANTED = 10;

/** 消費後に部屋 UI が残数を再取得する */
export const AI_TRIAL_STATUS_UPDATED_EVENT = 'mc:ai-trial-status-updated';

export type AiTrialPhase =
  | 'guest'
  | 'email_unconfirmed'
  | 'preview'
  /** 付与資格あり・DB 未行（初回の AI 実利用時に付与） */
  | 'trial_eligible'
  /** 同一 IP ソフト上限により新規付与不可 */
  | 'trial_ip_limited'
  /** メール経路: 確認後の最低待機中 */
  | 'trial_email_cooling'
  | 'trial_active'
  | 'trial_exhausted'
  | 'credits_active'
  | 'developer_unlimited'
  | 'supporter_unlimited';

export type AiTrialStatus = {
  phase: AiTrialPhase;
  songsGranted: number;
  songsRemaining: number;
  atQuestionsGranted: number;
  atQuestionsRemaining: number;
  /** Phase B 以降 true。false の間は UI 表示のみで枠は消費しない */
  enforcementEnabled: boolean;
  /** お試し枯渇後のプリペイドクレジット（`AI_CREDITS_ENABLED=1` 時） */
  creditsEnabled: boolean;
  creditsRemaining: number;
};

export function resolveTrialPhaseFromEntitlement(params: {
  songsRemaining: number;
  creditsEnabled: boolean;
  creditsRemaining: number;
}): AiTrialPhase {
  if (params.songsRemaining > 0) return 'trial_active';
  if (params.creditsEnabled && params.creditsRemaining > 0) return 'credits_active';
  return 'trial_exhausted';
}

const CREDITS_STATUS_DEFAULTS = { creditsEnabled: false, creditsRemaining: 0 } as const;

/** クライアント: env を持たず API 応答だけで開発者無制限か判定 */
export function isAiDeveloperUnlimitedTrialStatus(
  status: AiTrialStatus | null | undefined,
): boolean {
  return status?.phase === 'developer_unlimited';
}

/** クライアント: API 応答だけでサポーター無制限か判定 */
export function isAiSupporterUnlimitedTrialStatus(
  status: AiTrialStatus | null | undefined,
): boolean {
  return status?.phase === 'supporter_unlimited';
}

/** 開発者・サポーターいずれかの AI 無制限（枠消費・二段選曲ボタン非表示等） */
export function isAiUnlimitedTrialStatus(status: AiTrialStatus | null | undefined): boolean {
  return (
    status?.phase === 'developer_unlimited' || status?.phase === 'supporter_unlimited'
  );
}

/** `AI_TRIAL_ENFORCEMENT_ENABLED=1` のときのみ消費・API ガードを有効化 */
export function isAiTrialEnforcementEnabled(): boolean {
  return process.env.AI_TRIAL_ENFORCEMENT_ENABLED === '1';
}

export function buildPreviewAiTrialStatus(): AiTrialStatus {
  const enforcement = isAiTrialEnforcementEnabled();
  return {
    phase: enforcement ? 'trial_active' : 'preview',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: AI_TRIAL_SONGS_GRANTED,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: AI_TRIAL_AT_QUESTIONS_GRANTED,
    enforcementEnabled: enforcement,
    ...CREDITS_STATUS_DEFAULTS,
  };
}

export function buildEmailUnconfirmedAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'email_unconfirmed',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: 0,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: 0,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

/** 確認済み・未付与。初回の AI 付き選曲または @ 成功時に付与 */
export function buildTrialEligibleAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'trial_eligible',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: AI_TRIAL_SONGS_GRANTED,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: AI_TRIAL_AT_QUESTIONS_GRANTED,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

export function buildTrialIpLimitedAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'trial_ip_limited',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: 0,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: 0,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

export function buildTrialEmailCoolingAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'trial_email_cooling',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: 0,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: 0,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

/** 開発者アカウント: お試し枠・@ 枠の消費・API ガードを適用しない */
export function buildDeveloperUnlimitedAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'developer_unlimited',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: AI_TRIAL_SONGS_GRANTED,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: AI_TRIAL_AT_QUESTIONS_GRANTED,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

/** サポーターアカウント: 開発者と同様に枠・API ガードを適用しない */
export function buildSupporterUnlimitedAiTrialStatus(): AiTrialStatus {
  return {
    phase: 'supporter_unlimited',
    songsGranted: AI_TRIAL_SONGS_GRANTED,
    songsRemaining: AI_TRIAL_SONGS_GRANTED,
    atQuestionsGranted: AI_TRIAL_AT_QUESTIONS_GRANTED,
    atQuestionsRemaining: AI_TRIAL_AT_QUESTIONS_GRANTED,
    enforcementEnabled: isAiTrialEnforcementEnabled(),
    ...CREDITS_STATUS_DEFAULTS,
  };
}

export function formatAiTrialStatusPrimaryLine(status: AiTrialStatus): string {
  if (status.phase === 'developer_unlimited') {
    return '開発者アカウント（AI 制限なし）';
  }
  if (status.phase === 'supporter_unlimited') {
    return 'サポータアカウント（AI 制限なし）';
  }
  if (status.phase === 'email_unconfirmed') {
    return `メール確認後に AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲が使えます（今は選曲のみ）`;
  }
  if (status.phase === 'trial_eligible') {
    return `AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲（初回の AI 利用時に付与）· @質問 ${AI_TRIAL_AT_QUESTIONS_GRANTED} 回`;
  }
  if (status.phase === 'trial_ip_limited') {
    return 'AI お試し枠を付与できません（同一ネットワークの上限）— 選曲のみは無料';
  }
  if (status.phase === 'trial_email_cooling') {
    return 'メール確認直後のため、まもなく AI お試し枠が付与されます（今は選曲のみ）';
  }
  if (status.phase === 'trial_exhausted') {
    return `AI お試し ${AI_TRIAL_SONGS_GRANTED} 曲 使い切り — 選曲・再生・チャットは無料のまま`;
  }
  if (status.phase === 'credits_active') {
    return `AI クレジット 残 ${formatAiCreditAmount(status.creditsRemaining)}（1曲＝1・@1回＝0.5）`;
  }
  const songs = `AI お試し 残 ${status.songsRemaining}/${status.songsGranted} 曲`;
  const at = `@質問 残 ${status.atQuestionsRemaining}/${status.atQuestionsGranted}`;
  return `${songs} · ${at}`;
}

/** チャットヘッダー用の短いラベル（例: AIお試し残 7/20） */
export function formatAiTrialStatusHeaderLabel(status: AiTrialStatus): string {
  if (status.phase === 'developer_unlimited') return 'AI制限なし（開発者）';
  if (status.phase === 'supporter_unlimited') return 'AI制限なし（サポーター）';
  if (status.phase === 'email_unconfirmed') return 'AIお試し: 確認待ち';
  if (status.phase === 'trial_eligible') return `AIお試し 付与待ち ${status.songsGranted}曲`;
  if (status.phase === 'trial_ip_limited') return 'AIお試し: 付与上限';
  if (status.phase === 'trial_email_cooling') return 'AIお試し: 待機中';
  if (status.phase === 'trial_exhausted') return `AIお試し残 0/${status.songsGranted}`;
  if (status.phase === 'credits_active') {
    return `AIクレジット残 ${formatAiCreditAmount(status.creditsRemaining)}`;
  }
  return `AIお試し残 ${status.songsRemaining}/${status.songsGranted}`;
}

export function formatAiTrialStatusSecondaryLine(status: AiTrialStatus): string | null {
  if (status.phase === 'preview' && !status.enforcementEnabled) {
    return '※試験運用中のため、枠はまだ消費されません';
  }
  if (status.phase === 'trial_eligible') {
    return '初回の AI 付き選曲または @ 質問の成功時に枠が付与・消費されます。';
  }
  if (status.phase === 'trial_ip_limited') {
    return 'ご家族・学校回線などでお困りの場合はお問い合わせください。';
  }
  if (status.phase === 'trial_email_cooling') {
    return 'メール登録では確認完了から短時間の待機後に付与します（不正防止）。';
  }
  if (status.phase === 'trial_active' && status.songsRemaining <= 2 && status.songsRemaining > 0) {
    return 'お試し残りわずかです。AI なし選曲はいつでも無料です。';
  }
  if (status.phase === 'credits_active' && status.creditsRemaining <= 3 && status.creditsRemaining > 0) {
    return 'クレジット残りわずかです。';
  }
  return null;
}
