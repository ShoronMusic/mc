import {
  aiOperationsHaltedUserMessageJa,
  ensureAiMonthlyBudgetStatusFresh,
  type AiOperationsHaltReason,
} from '@/lib/ai-monthly-budget';
import { getGeminiGenerationRoutingSummary, isGeminiConfigured } from '@/lib/gemini';
import {
  getNextSongRecommendBetaUserIds,
  isNextSongRecommendMasterEnabled,
} from '@/lib/next-song-recommend-feature';
import { isYouTubeConfigured } from '@/lib/youtube-search';
import { isAblyServerConfigured } from '@/lib/ably-server-key';
import { isAiTrialEnforcementEnabled } from '@/lib/ai-trial-status';
import { getStyleAdminUserIds } from '@/lib/style-admin';
import { isAiQuestionGuardServerFailOpen } from '@/lib/server-ai-question-guard';

export type AiStatusSnapshot = {
  fetchedAtIso: string;
  gemini: boolean;
  geminiGeneration: ReturnType<typeof getGeminiGenerationRoutingSummary>;
  youtube: boolean;
  aiOperations: {
    halted: boolean;
    reason: AiOperationsHaltReason;
    messageJa: string | null;
    monthlyBudgetEnabled: boolean;
    monthKeyJst: string;
    variableCostJpyApprox: number;
    budgetJpy: number;
    usagePercent: number | null;
    checkedAtIso: string | null;
  };
  nextSongRecommend: {
    masterEnabled: boolean;
    betaUserIdsConfigured: boolean;
  };
  /** 敵対検証向けの危険な未設定検出（秘密は出さない） */
  securityHardening: {
    ablyServerKeyConfigured: boolean;
    ablyClientAuthEnabled: boolean;
    aiTrialEnforcementEnabled: boolean;
    styleAdminConfigured: boolean;
    questionGuardServerFailOpen: boolean;
    warnings: string[];
  };
};

export async function buildAiStatusSnapshot(): Promise<AiStatusSnapshot> {
  const budget = await ensureAiMonthlyBudgetStatusFresh();
  const routing = getGeminiGenerationRoutingSummary();
  const usagePercent =
    budget.enabled && budget.budgetJpy > 0
      ? Math.min(100, (budget.variableCostJpyApprox / budget.budgetJpy) * 100)
      : null;

  const ablyServerKeyConfigured = isAblyServerConfigured();
  const ablyClientAuthEnabled = process.env.NEXT_PUBLIC_ABLY_ENABLED === '1';
  const aiTrialEnforcementEnabled = isAiTrialEnforcementEnabled();
  const styleAdminConfigured = getStyleAdminUserIds().length > 0;
  const questionGuardServerFailOpen = isAiQuestionGuardServerFailOpen();
  const warnings: string[] = [];
  if (ablyClientAuthEnabled && !ablyServerKeyConfigured) {
    warnings.push('NEXT_PUBLIC_ABLY_ENABLED=1 だが ABLY_API_KEY 未設定');
  }
  if (!aiTrialEnforcementEnabled) {
    warnings.push('AI_TRIAL_ENFORCEMENT_ENABLED がオフ（選曲 AI 枠なし）');
  }
  if (!styleAdminConfigured) {
    warnings.push('STYLE_ADMIN_USER_IDS 未設定（視聴履歴 PATCH・管理画面は全拒否）');
  }
  if (questionGuardServerFailOpen) {
    warnings.push('AI_QUESTION_GUARD_SERVER_FAIL_OPEN=1（分類障害時に質問を通す）');
  }
  if (process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim()) {
    warnings.push('NEXT_PUBLIC_ABLY_API_KEY が残存（削除し Token Auth へ移行してください）');
  }

  return {
    fetchedAtIso: new Date().toISOString(),
    gemini: isGeminiConfigured(),
    geminiGeneration: routing,
    youtube: isYouTubeConfigured(),
    aiOperations: {
      halted: budget.halted,
      reason: budget.reason,
      messageJa: budget.halted ? aiOperationsHaltedUserMessageJa(budget.reason) : null,
      monthlyBudgetEnabled: budget.enabled,
      monthKeyJst: budget.monthKeyJst,
      variableCostJpyApprox: budget.variableCostJpyApprox,
      budgetJpy: budget.budgetJpy,
      usagePercent,
      checkedAtIso: budget.checkedAtIso,
    },
    nextSongRecommend: {
      masterEnabled: isNextSongRecommendMasterEnabled(),
      betaUserIdsConfigured: getNextSongRecommendBetaUserIds().length > 0,
    },
    securityHardening: {
      ablyServerKeyConfigured,
      ablyClientAuthEnabled,
      aiTrialEnforcementEnabled,
      styleAdminConfigured,
      questionGuardServerFailOpen,
      warnings,
    },
  };
}
