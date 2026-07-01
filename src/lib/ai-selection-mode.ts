import type { AiTrialStatus } from '@/lib/ai-trial-status';

/** 選曲 1 回あたりの AI 利用モード（`docs/00-ai-trial-and-billing-implementation.md`） */
export type AiSelectionMode = 'full' | 'none';

export function parseAiSelectionMode(raw: unknown): AiSelectionMode | undefined {
  if (raw === 'full' || raw === 'none') return raw;
  return undefined;
}

export function resolveAiSelectionMode(params: {
  explicitMode?: AiSelectionMode;
  isGuest: boolean;
  participatesInSelection: boolean;
  aiTrialStatus: AiTrialStatus | null;
}): AiSelectionMode {
  const { explicitMode, isGuest, participatesInSelection, aiTrialStatus } = params;

  if (explicitMode === 'none') return 'none';
  if (isGuest || !participatesInSelection) return 'none';

  const status = aiTrialStatus;
  if (!status) {
    // お試し API 応答前でも登録ユーザーの通常選曲は AI 付き（サーバー側で再検証）
    return 'full';
  }

  if (status.phase === 'email_unconfirmed' || status.phase === 'trial_exhausted') {
    return 'none';
  }

  if (
    !status.enforcementEnabled ||
    status.phase === 'preview' ||
    (status.phase === 'trial_active' && status.songsRemaining > 0)
  ) {
    return 'full';
  }

  return 'none';
}

/** 二段ボタン（AI 付き / AI なし）を出すか */
export function shouldShowAiDualSelectionButtons(params: {
  isGuest: boolean;
  participatesInSelection: boolean;
  aiTrialStatus: AiTrialStatus | null;
}): boolean {
  const { isGuest, participatesInSelection, aiTrialStatus } = params;
  if (isGuest || !participatesInSelection || !aiTrialStatus) return false;
  if (!aiTrialStatus.enforcementEnabled) return false;
  return aiTrialStatus.phase === 'trial_active' && aiTrialStatus.songsRemaining > 0;
}
