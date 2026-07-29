'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IS_MC_PRODUCT,
  mypagePanelClass,
  mypagePrimaryBtnClass,
  mypageSecondaryBtnClass,
  mypageSectionTitleClass,
} from '@/lib/product-branding';
import {
  AI_TRIAL_STATUS_UPDATED_EVENT,
  formatAiTrialStatusPrimaryLine,
  isAiUnlimitedTrialStatus,
} from '@/lib/ai-trial-status';
import { useAiTrialStatus } from '@/hooks/useAiTrialStatus';
import type { UserAiUsageLedgerItem } from '@/lib/user-ai-usage-ledger';

type MyPageAiUsageLedgerProps = {
  enabled: boolean;
};

function formatLedgerAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function MyPageAiUsageLedger({ enabled }: MyPageAiUsageLedgerProps) {
  const { status: aiTrialStatus, state: aiTrialState } = useAiTrialStatus(!enabled);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserAiUsageLedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(false);
    void fetch('/api/user/ai-usage-ledger?limit=60', { credentials: 'include' })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          items?: UserAiUsageLedgerItem[];
        } | null;
        if (!r.ok) {
          setError(true);
          setItems([]);
          return;
        }
        setItems(Array.isArray(data?.items) ? data!.items! : []);
      })
      .catch(() => {
        setError(true);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !open) return;
    load();
  }, [enabled, open, load]);

  useEffect(() => {
    if (!enabled) return;
    const onUpdated = () => {
      if (open) load();
    };
    window.addEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdated);
  }, [enabled, open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!enabled) return null;

  const unlimited = isAiUnlimitedTrialStatus(aiTrialStatus);
  const statusLine =
    aiTrialState === 'ready' && aiTrialStatus
      ? formatAiTrialStatusPrimaryLine(aiTrialStatus)
      : null;

  return (
    <>
      <div className={mypagePanelClass()}>
        <h3 className={mypageSectionTitleClass()}>AI 利用・クレジット履歴</h3>
        <p
          className={`mt-1 text-xs leading-relaxed ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'}`}
        >
          お試し付与・消費、クレジットの購入・消費を確認できます。
        </p>
        {statusLine ? (
          <p className={`mt-2 text-[11px] ${IS_MC_PRODUCT ? 'text-gray-700' : 'text-gray-300'}`}>
            いまの枠: {statusLine}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-2 ${mypageSecondaryBtnClass(true)}`}
        >
          履歴を開く
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="AI 利用・クレジット履歴"
          onClick={() => setOpen(false)}
        >
          <div
            className={`flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl ${
              IS_MC_PRODUCT
                ? 'border-gray-200 bg-white text-gray-900'
                : 'border-gray-700 bg-gray-900 text-gray-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 ${
                IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700'
              }`}
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold">AI 利用・クレジット履歴</h3>
                <p
                  className={`mt-1 text-xs leading-relaxed ${
                    IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  お試しの付与・消費、クレジットの購入・付与・消費を新しい順に表示します。AI
                  付き選曲が成功したときだけ減ります。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={mypageSecondaryBtnClass(true)}
              >
                閉じる
              </button>
            </div>

            <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {statusLine ? (
                <p
                  className={`rounded border px-2 py-1.5 text-[11px] ${
                    IS_MC_PRODUCT
                      ? 'border-violet-200 bg-violet-50 text-violet-900'
                      : 'border-violet-800/50 bg-violet-950/30 text-violet-100'
                  }`}
                >
                  いまの枠: {statusLine}
                </p>
              ) : null}

              {unlimited ? (
                <p
                  className={`mt-2 text-[11px] leading-relaxed ${
                    IS_MC_PRODUCT ? 'text-amber-800' : 'text-amber-200/90'
                  }`}
                >
                  このアカウントは AI
                  制限なしのため、選曲してもお試し／クレジットは減らず、消費の履歴は増えません。
                </p>
              ) : null}

              {loading && items.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">読み込み中…</p>
              ) : error ? (
                <p className="mt-3 text-sm text-amber-300">
                  履歴を読み込めませんでした。しばらくしてから再度お試しください。
                </p>
              ) : items.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">まだ履歴がありません。</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {items.map((row) => {
                    const positive = row.deltaLabel.startsWith('+');
                    return (
                      <li
                        key={row.id}
                        className={`rounded border px-2.5 py-2 text-xs ${
                          IS_MC_PRODUCT
                            ? 'border-gray-200 bg-white/80'
                            : 'border-gray-700/70 bg-gray-900/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={`font-medium ${
                                IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-100'
                              }`}
                            >
                              {row.label}
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              {formatLedgerAt(row.at)}
                            </p>
                            {row.roomId ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">部屋 {row.roomId}</p>
                            ) : null}
                            {row.note?.trim() ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">{row.note.trim()}</p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`tabular-nums font-medium ${
                                positive
                                  ? 'text-emerald-400'
                                  : IS_MC_PRODUCT
                                    ? 'text-gray-800'
                                    : 'text-amber-200'
                              }`}
                            >
                              {row.deltaLabel}
                            </p>
                            {row.balanceAfterLabel ? (
                              <p className="mt-0.5 text-[10px] text-gray-500">
                                {row.balanceAfterLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div
              className={`flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3 ${
                IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700'
              }`}
            >
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                className={mypageSecondaryBtnClass(true)}
              >
                {loading ? '読み込み中…' : '再読み込み'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className={mypagePrimaryBtnClass()}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
