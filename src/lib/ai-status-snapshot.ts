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
};

export async function buildAiStatusSnapshot(): Promise<AiStatusSnapshot> {
  const budget = await ensureAiMonthlyBudgetStatusFresh();
  const routing = getGeminiGenerationRoutingSummary();
  const usagePercent =
    budget.enabled && budget.budgetJpy > 0
      ? Math.min(100, (budget.variableCostJpyApprox / budget.budgetJpy) * 100)
      : null;

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
  };
}
