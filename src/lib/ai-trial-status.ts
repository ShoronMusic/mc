/** 登録ユーザー向け AI お試し 10 曲（`docs/00-ai-trial-and-billing-implementation.md`） */

export const AI_TRIAL_SONGS_GRANTED = 10;
export const AI_TRIAL_AT_QUESTIONS_GRANTED = 5;

/** 消費後に部屋 UI が残数を再取得する */
export const AI_TRIAL_STATUS_UPDATED_EVENT = 'mc:ai-trial-status-updated';

export type AiTrialPhase =
  | 'guest'
  | 'email_unconfirmed'
  | 'preview'
  | 'trial_active'
  | 'trial_exhausted';

export type AiTrialStatus = {
  phase: AiTrialPhase;
  songsGranted: number;
  songsRemaining: number;
  atQuestionsGranted: number;
  atQuestionsRemaining: number;
  /** Phase B 以降 true。false の間は UI 表示のみで枠は消費しない */
  enforcementEnabled: boolean;
};

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
  };
}

export function formatAiTrialStatusPrimaryLine(status: AiTrialStatus): string {
  if (status.phase === 'email_unconfirmed') {
    return 'メール確認後に AI お試し 10 曲が使えます（今は選曲のみ）';
  }
  if (status.phase === 'trial_exhausted') {
    return 'AI お試し 10 曲 使い切り — 選曲・再生・チャットは無料のまま';
  }
  const songs = `AI お試し 残 ${status.songsRemaining}/${status.songsGranted} 曲`;
  const at = `@質問 残 ${status.atQuestionsRemaining}/${status.atQuestionsGranted}`;
  return `${songs} · ${at}`;
}

/** チャットヘッダー用の短いラベル（例: AIお試し残 7/10） */
export function formatAiTrialStatusHeaderLabel(status: AiTrialStatus): string {
  if (status.phase === 'email_unconfirmed') return 'AIお試し: 確認待ち';
  if (status.phase === 'trial_exhausted') return `AIお試し残 0/${status.songsGranted}`;
  return `AIお試し残 ${status.songsRemaining}/${status.songsGranted}`;
}

export function formatAiTrialStatusSecondaryLine(status: AiTrialStatus): string | null {
  if (status.phase === 'preview' && !status.enforcementEnabled) {
    return '※試験運用中のため、枠はまだ消費されません';
  }
  if (status.phase === 'trial_active' && status.songsRemaining <= 2 && status.songsRemaining > 0) {
    return 'お試し残りわずかです。AI なし選曲はいつでも無料です。';
  }
  return null;
}
