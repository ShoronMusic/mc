'use client';

import { IS_MC_PRODUCT } from '@/lib/product-branding';
import {
  AI_USAGE_DISCLOSURE_CURRENT_FREE,
  AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES,
  AI_USAGE_DISCLOSURE_ROOM_SUMMARY,
  AI_USAGE_DISCLOSURE_TITLE,
} from '@/lib/ai-usage-disclosure-copy';
import {
  AI_CREDITS_BILLING_SUMMARY_FOOTNOTE,
  AI_CREDITS_BILLING_SUMMARY_LINES,
  AI_CREDITS_BILLING_SUMMARY_TITLE,
} from '@/lib/ai-credits-pricing-guide';
import {
  formatAiTrialStatusPrimaryLine,
  formatAiTrialStatusSecondaryLine,
  type AiTrialStatus,
} from '@/lib/ai-trial-status';

type AiUsageBillingModalProps = {
  open: boolean;
  onClose: () => void;
  status: AiTrialStatus | null;
  loading?: boolean;
};

export function AiUsageBillingModal({
  open,
  onClose,
  status,
  loading = false,
}: AiUsageBillingModalProps) {
  if (!open || IS_MC_PRODUCT) return null;

  const primaryLine = status ? formatAiTrialStatusPrimaryLine(status) : null;
  const secondaryLine = status ? formatAiTrialStatusSecondaryLine(status) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-usage-billing-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(88vh,40rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-violet-800/70 bg-gray-900 p-4 text-xs leading-relaxed text-violet-100/90 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="ai-usage-billing-title" className="text-sm font-medium text-violet-100">
            {loading ? 'AI お試し枠を読み込み中…' : primaryLine ?? 'AI 利用'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        {loading ? null : !status ? (
          <p className="text-violet-200/70">AI お試し枠を取得できませんでした</p>
        ) : (
          <div className="space-y-3">
            {secondaryLine ? <p className="text-[11px] text-violet-200/80">{secondaryLine}</p> : null}
            <p>
              <span className="font-medium text-violet-200">{AI_USAGE_DISCLOSURE_TITLE}: </span>
              <span className="font-medium text-emerald-200/95">{AI_USAGE_DISCLOSURE_CURRENT_FREE}</span>
              <span className="mt-1.5 block text-violet-100/85">{AI_USAGE_DISCLOSURE_ROOM_SUMMARY}</span>
            </p>
            <div className="rounded border border-emerald-900/40 bg-emerald-950/25 p-3">
              <p className="text-sm font-medium text-emerald-100/95">{AI_CREDITS_BILLING_SUMMARY_TITLE}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-violet-100/90">
                {AI_CREDITS_BILLING_SUMMARY_LINES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-violet-200/80">
                {AI_CREDITS_BILLING_SUMMARY_FOOTNOTE}
              </p>
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-violet-100/85">
              {AI_USAGE_DISCLOSURE_ROOM_DETAIL_LINES.map((line) => (
                <li key={line.slice(0, 24)}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
