'use client';

import {
  GEMINI_USAGE_CATEGORIES,
  geminiUsageCategoryCostPercents,
  type GeminiUsageCategoryId,
} from '@/lib/gemini-usage-categories';
import { formatGeminiCostJpyApprox, type GeminiUsageTokenSummary } from '@/lib/gemini-pricing';
import { AI_USAGE_CATEGORY_COMPARISON_INTRO } from '@/lib/ai-usage-disclosure-copy';

const CATEGORY_BAR_CLASS: Record<GeminiUsageCategoryId, string> = {
  commentary: 'bg-sky-500/80',
  at_question: 'bg-amber-500/80',
  other: 'bg-gray-500/70',
};

type GeminiUsageCategoryBreakdownProps = {
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  /** タイトル行を出す */
  title?: string;
  /** 参考の目安説明（データがなくても出せる） */
  showTypicalHints?: boolean;
  /** 参加履歴1行など、棒グラフ＋内訳のみ */
  compact?: boolean;
  className?: string;
};

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function GeminiUsageCategoryBreakdown({
  byCategory,
  title = '種別ごとの利用（試算）',
  showTypicalHints = false,
  compact = false,
  className = '',
}: GeminiUsageCategoryBreakdownProps) {
  const percents = geminiUsageCategoryCostPercents(byCategory);
  const hasData = GEMINI_USAGE_CATEGORIES.some((c) => byCategory[c.id].calls > 0);

  return (
    <div className={`space-y-2 ${className}`}>
      {title ? <p className="text-xs font-medium text-violet-200/95 sm:text-sm">{title}</p> : null}
      {!compact ? (
        <p className="text-xs leading-relaxed text-gray-400">{AI_USAGE_CATEGORY_COMPARISON_INTRO}</p>
      ) : null}
      {showTypicalHints ? (
        <ul className="space-y-1.5 text-xs leading-relaxed text-gray-400">
          {GEMINI_USAGE_CATEGORIES.map((cat) => (
            <li key={cat.id}>
              <span className="font-medium text-gray-300">{cat.shortJa}:</span> {cat.typicalCostHintJa}
            </li>
          ))}
        </ul>
      ) : null}
      {hasData && percents ? (
        <div className="space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-800">
            {GEMINI_USAGE_CATEGORIES.map((cat) => {
              const pct = percents[cat.id];
              if (pct <= 0) return null;
              return (
                <div
                  key={cat.id}
                  className={`${CATEGORY_BAR_CLASS[cat.id]} h-full`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                  title={`${cat.labelJa} ${pct}%`}
                />
              );
            })}
          </div>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            {GEMINI_USAGE_CATEGORIES.map((cat) => {
              const row = byCategory[cat.id];
              if (row.calls <= 0) return null;
              const pct = percents[cat.id];
              return (
                <li key={cat.id} className="text-gray-300">
                  <span className={`inline-block h-2 w-2 rounded-full ${CATEGORY_BAR_CLASS[cat.id]} mr-1.5 align-middle`} />
                  <span className="font-medium text-gray-200">{cat.labelJa}</span>
                  {' · '}
                  {row.calls} 回（{pct}%）
                  {' · '}
                  入力                   {formatTokenCount(row.promptTokens)}
                  {' · '}
                  運営原価 {formatGeminiCostJpyApprox(row.costJpyApprox)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : !showTypicalHints ? (
        <p className="text-xs text-gray-500">種別データはまだありません。</p>
      ) : null}
    </div>
  );
}
