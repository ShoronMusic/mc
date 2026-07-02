import { NextResponse } from 'next/server';
import { ensureAiMonthlyBudgetStatusFresh } from '@/lib/ai-monthly-budget';
import { getGeminiGenerationRoutingSummary, isGeminiConfigured } from '@/lib/gemini';
import {
  getNextSongRecommendBetaUserIds,
  isNextSongRecommendMasterEnabled,
} from '@/lib/next-song-recommend-feature';
import { isYouTubeConfigured } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function GET() {
  const budget = await ensureAiMonthlyBudgetStatusFresh();
  const routing = getGeminiGenerationRoutingSummary();
  return NextResponse.json({
    gemini: isGeminiConfigured(),
    geminiGeneration: routing,
    youtube: isYouTubeConfigured(),
    aiOperations: {
      halted: budget.halted,
      reason: budget.reason,
      monthlyBudgetEnabled: budget.enabled,
      monthKeyJst: budget.monthKeyJst,
      variableCostJpyApprox: budget.variableCostJpyApprox,
      budgetJpy: budget.budgetJpy,
    },
    nextSongRecommend: {
      masterEnabled: isNextSongRecommendMasterEnabled(),
      betaUserIdsConfigured: getNextSongRecommendBetaUserIds().length > 0,
    },
  });
}
