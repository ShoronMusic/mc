'use client';

import { useState } from 'react';
import {
  AI_USAGE_DISCLOSURE_CURRENT_FREE,
  AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES,
  AI_USAGE_DISCLOSURE_ROOM_SUMMARY,
  AI_USAGE_DISCLOSURE_TITLE,
} from '@/lib/ai-usage-disclosure-copy';
import { formatAiTrialStatusPrimaryLine, formatAiTrialStatusSecondaryLine } from '@/lib/ai-trial-status';
import { emptyGeminiUsageByCategory } from '@/lib/gemini-usage-categories';
import { GeminiUsageCategoryBreakdown } from '@/components/mypage/GeminiUsageCategoryBreakdown';
import { SongSelectionCostGuide } from '@/components/shared/SongSelectionCostGuide';
import { useAiTrialStatus } from '@/hooks/useAiTrialStatus';

type AiUsageBillingNoticeProps = {
  isGuest?: boolean;
  className?: string;
};

export function AiUsageBillingNotice({ isGuest = false, className = '' }: AiUsageBillingNoticeProps) {
  const [open, setOpen] = useState(false);
  const { status, state } = useAiTrialStatus(isGuest);

  if (isGuest) {
    return null;
  }

  const loading = state === 'loading';
  const primaryLine = status ? formatAiTrialStatusPrimaryLine(status) : null;
  const secondaryLine = status ? formatAiTrialStatusSecondaryLine(status) : null;

  return (
    <div
      className={`rounded border border-violet-900/50 bg-violet-950/25 px-2.5 py-1.5 text-xs leading-relaxed text-violet-100/90 ${className}`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 font-medium text-violet-100/95" role="status">
          {loading ? (
            <span className="text-violet-200/70">AI お試し枠を読み込み中…</span>
          ) : primaryLine ? (
            primaryLine
          ) : (
            <span className="text-violet-200/70">AI お試し枠を取得できませんでした</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={loading || !status}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-violet-700/60 text-[10px] leading-none text-violet-200 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          aria-expanded={open}
          aria-label={open ? 'AI 利用説明を閉じる' : 'AI 利用説明を開く'}
          title={open ? '閉じる' : '詳細'}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && status ? (
        <div className="mt-2 space-y-3 border-t border-violet-900/40 pt-2">
          {secondaryLine ? (
            <p className="text-[11px] text-violet-200/80">{secondaryLine}</p>
          ) : null}
          <p>
            <span className="font-medium text-violet-200">{AI_USAGE_DISCLOSURE_TITLE}: </span>
            <span className="font-medium text-emerald-200/95">{AI_USAGE_DISCLOSURE_CURRENT_FREE}</span>
            <span className="mt-1.5 block text-violet-100/85">{AI_USAGE_DISCLOSURE_ROOM_SUMMARY}</span>
          </p>
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
