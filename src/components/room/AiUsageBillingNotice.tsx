'use client';

import { useState } from 'react';
import {
  AI_USAGE_DISCLOSURE_CURRENT_FREE,
  AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES,
  AI_USAGE_DISCLOSURE_ROOM_SUMMARY,
  AI_USAGE_DISCLOSURE_TITLE,
} from '@/lib/ai-usage-disclosure-copy';
import { emptyGeminiUsageByCategory } from '@/lib/gemini-usage-categories';
import { GeminiUsageCategoryBreakdown } from '@/components/mypage/GeminiUsageCategoryBreakdown';
import { SongSelectionCostGuide } from '@/components/shared/SongSelectionCostGuide';

type AiUsageBillingNoticeProps = {
  isGuest?: boolean;
  className?: string;
};

export function AiUsageBillingNotice({ isGuest = false, className = '' }: AiUsageBillingNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded border border-violet-900/50 bg-violet-950/25 px-2.5 py-2 text-xs leading-relaxed text-violet-100/90 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p>
          <span className="font-medium text-violet-200">{AI_USAGE_DISCLOSURE_TITLE}: </span>
          <span className="font-medium text-emerald-200/95">{AI_USAGE_DISCLOSURE_CURRENT_FREE}</span>
          <span className="mt-1.5 block text-violet-100/85">{AI_USAGE_DISCLOSURE_ROOM_SUMMARY}</span>
          {isGuest ? (
            <span className="mt-1 block text-violet-200/80">
              ゲストの AI 利用も、現時点では追加料金はかかりません。
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded border border-violet-700/60 px-2 py-0.5 text-[11px] text-violet-200 hover:bg-violet-900/40"
          aria-expanded={open}
        >
          {open ? '閉じる' : '詳細'}
        </button>
      </div>
      {open ? (
        <div className="mt-2 space-y-3 border-t border-violet-900/40 pt-2">
          <SongSelectionCostGuide variant="room" />
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-violet-100/85">
            {AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES.map((line) => (
              <li key={line.slice(0, 24)}>{line}</li>
            ))}
          </ul>
          <GeminiUsageCategoryBreakdown
            byCategory={emptyGeminiUsageByCategory()}
            title="AI 機能ごとの料金目安（参考）"
            showTypicalHints
            className="rounded border border-violet-900/30 bg-violet-950/30 p-2 text-violet-100/90 [&_.text-gray-400]:text-violet-200/85 [&_.text-gray-300]:text-violet-100/90 [&_.text-gray-500]:text-violet-200/75"
          />
        </div>
      ) : null}
    </div>
  );
}
