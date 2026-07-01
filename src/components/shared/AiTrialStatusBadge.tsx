'use client';

import type { AiTrialStatus } from '@/lib/ai-trial-status';
import {
  formatAiTrialStatusHeaderLabel,
  formatAiTrialStatusPrimaryLine,
  formatAiTrialStatusSecondaryLine,
} from '@/lib/ai-trial-status';

type AiTrialStatusBadgeProps = {
  status: AiTrialStatus | null;
  loading?: boolean;
  /** room: 送信欄上 / mypage: 参加履歴 / header: チャットヘッダー / compact */
  variant?: 'room' | 'mypage' | 'compact' | 'header';
  className?: string;
};

export function AiTrialStatusBadge({
  status,
  loading = false,
  variant = 'room',
  className = '',
}: AiTrialStatusBadgeProps) {
  if (loading && variant === 'header') {
    return (
      <span
        className={`shrink-0 rounded border border-violet-600/40 bg-violet-950/25 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-violet-200/60 ${className}`}
        role="status"
        aria-label="AI お試し枠を読み込み中"
      >
        …
      </span>
    );
  }
  if (loading) {
    return (
      <p className={`text-xs text-violet-200/70 ${className}`} role="status">
        AI お試し枠を読み込み中…
      </p>
    );
  }
  if (!status) return null;

  const primary = formatAiTrialStatusPrimaryLine(status);
  const secondary = formatAiTrialStatusSecondaryLine(status);
  const exhausted = status.phase === 'trial_exhausted';
  const unconfirmed = status.phase === 'email_unconfirmed';

  const borderClass = exhausted
    ? 'border-amber-700/50 bg-amber-950/30 text-amber-100/95'
    : unconfirmed
      ? 'border-gray-600/60 bg-gray-900/50 text-gray-300'
      : 'border-violet-600/50 bg-violet-950/40 text-violet-100/95';

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex max-w-full items-center rounded border px-2 py-0.5 text-[11px] leading-snug ${borderClass} ${className}`}
        title={secondary ?? undefined}
      >
        {primary}
      </span>
    );
  }

  if (variant === 'header') {
    const label = formatAiTrialStatusHeaderLabel(status);
    return (
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-tight ${borderClass} ${className}`}
        title={[formatAiTrialStatusPrimaryLine(status), secondary].filter(Boolean).join('\n')}
        role="status"
      >
        {label}
      </span>
    );
  }

  return (
    <div
      className={`rounded border px-2.5 py-2 text-xs leading-relaxed ${borderClass} ${className}`}
      role="status"
    >
      <p className="font-medium">{primary}</p>
      {secondary ? <p className="mt-1 text-[11px] opacity-90">{secondary}</p> : null}
      {variant === 'mypage' && status.phase === 'preview' ? (
        <p className="mt-1.5 text-[11px] text-gray-400">
          登録ユーザー（メール確認済み）向けの生涯 10 曲お試しです。1 回の AI 付き選曲で 1 曲消費する予定です。
        </p>
      ) : null}
    </div>
  );
}
