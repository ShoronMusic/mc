/**
 * @ 質問 1回あたりの参加者向け料金目安（単一ソース）
 */

import { geminiUsageCategoryMeta } from '@/lib/gemini-usage-categories';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';
import type { UserAtQuestionHistoryPair } from '@/lib/user-at-question-history';

export const AT_QUESTION_COST_GUIDE_TITLE = '@ 質問 1回の料金目安（参考）';

export const AT_QUESTION_COST_GUIDE_CONDITIONS =
  '「@」で AI に質問した1回あたりの目安です。音楽関連の自動判定（質問ガード）と返答生成が含まれることがあります。';

export const AT_QUESTION_COST_GUIDE_FOOTNOTE =
  'クラウド AI 利用原価に基づく試算です。現時点での請求額ではありません。【現在無料】';

/** ログが取れないときの参考表示 */
export const AT_QUESTION_TYPICAL_COST_JPY_LABEL = '約 ¥0.4〜0.5 前後';

export function atQuestionTypicalCostHintJa(): string {
  return geminiUsageCategoryMeta('at_question').typicalCostHintJa;
}

export function formatAtQuestionPairCostLabel(pair: UserAtQuestionHistoryPair): string {
  if (pair.costSource === 'logged' && typeof pair.costJpyApprox === 'number' && pair.costJpyApprox > 0) {
    return formatGeminiCostJpyApprox(pair.costJpyApprox);
  }
  return AT_QUESTION_TYPICAL_COST_JPY_LABEL;
}

export function sumLoggedAtQuestionCostJpy(pairs: readonly UserAtQuestionHistoryPair[]): number {
  return pairs.reduce((s, p) => {
    if (p.costSource === 'logged' && typeof p.costJpyApprox === 'number') return s + p.costJpyApprox;
    return s;
  }, 0);
}
