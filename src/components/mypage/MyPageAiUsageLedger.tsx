'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  IS_MC_PRODUCT,
  mypagePanelClass,
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
  const [items, setItems] = useState<UserAiUsageLedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialLogAvailable, setTrialLogAvailable] = useState(true);
  const [creditTxAvailable, setCreditTxAvailable] = useState(true);
  const [trialSongsRemaining, setTrialSongsRemaining] = useState<number | null>(null);
  const [trialSongsGranted, setTrialSongsGranted] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    void fetch('/api/user/ai-usage-ledger?limit=60', { credentials: 'include' })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          error?: string;
          items?: UserAiUsageLedgerItem[];
          trialLogAvailable?: boolean;
          creditTxAvailable?: boolean;
          trialSongsRemaining?: number | null;
          trialSongsGranted?: number | null;
        } | null;
        if (!r.ok) {
          setError(typeof data?.error === 'string' ? data.error : '履歴の取得に失敗しました。');
          setItems([]);
          return;
        }
        setItems(Array.isArray(data?.items) ? data!.items! : []);
        setTrialLogAvailable(data?.trialLogAvailable !== false);
        setCreditTxAvailable(data?.creditTxAvailable !== false);
        setTrialSongsRemaining(
          typeof data?.trialSongsRemaining === 'number' ? data.trialSongsRemaining : null,
        );
        setTrialSongsGranted(
          typeof data?.trialSongsGranted === 'number' ? data.trialSongsGranted : null,
        );
      })
      .catch(() => {
        setError('履歴の取得に失敗しました。');
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onUpdated = () => load();
    window.addEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(AI_TRIAL_STATUS_UPDATED_EVENT, onUpdated);
  }, [enabled, load]);

  if (!enabled) return null;

  const unlimited = isAiUnlimitedTrialStatus(aiTrialStatus);
  const statusLine =
    aiTrialState === 'ready' && aiTrialStatus
      ? formatAiTrialStatusPrimaryLine(aiTrialStatus)
      : null;
  const consumeRows = items.filter((i) => i.kind !== 'trial_grant');

  return (
    <div className={mypagePanelClass()}>
      <h3 className={mypageSectionTitleClass()}>AI 利用・クレジット履歴</h3>
      <p className={`mt-1 text-xs leading-relaxed ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'}`}>
        初期お試しの付与、お試し消費、クレジットの購入・付与・消費を新しい順に表示します。AI
        付き選曲が成功したときだけ減り、失敗した曲解説は出ません。
      </p>

      {statusLine ? (
        <p
          className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
            IS_MC_PRODUCT
              ? 'border-violet-200 bg-violet-50 text-violet-900'
              : 'border-violet-800/50 bg-violet-950/30 text-violet-100'
          }`}
        >
          いまの枠: {statusLine}
          {trialSongsGranted != null && trialSongsRemaining != null ? (
            <span className="text-gray-500">
              {' '}
              （DB上のお試し残 {trialSongsRemaining}/{trialSongsGranted} 曲）
            </span>
          ) : null}
        </p>
      ) : null}

      {unlimited ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
          このアカウントは AI 無制限のため、選曲してもお試し／クレジットは減らず、消費行は増えません（初期付与の表示だけ残ります）。
        </p>
      ) : null}

      {!trialLogAvailable ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
          お試し消費ログ表（user_ai_trial_consumption_log）が未作成のため、お試しの消費行を表示できません。SQL
          は docs/supabase-user-ai-trial-table.md を参照してください。
        </p>
      ) : null}

      {!creditTxAvailable ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
          クレジット取引表が未作成のため、購入・クレジット消費は表示できません。
        </p>
      ) : null}

      {!unlimited &&
      trialLogAvailable &&
      consumeRows.length === 0 &&
      trialSongsGranted != null &&
      trialSongsRemaining != null &&
      trialSongsRemaining < trialSongsGranted ? (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
          お試し残は減っていますが、消費ログがありません（表作成前の消費など）。今後の成功選曲から行が付きます。
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">読み込み中…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-amber-300">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">まだ履歴がありません。</p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
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
                    <p className={`font-medium ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-100'}`}>
                      {row.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{formatLedgerAt(row.at)}</p>
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
                      <p className="mt-0.5 text-[10px] text-gray-500">{row.balanceAfterLabel}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => load()}
        className={`mt-2 text-[11px] underline decoration-dotted underline-offset-2 ${
          IS_MC_PRODUCT ? 'text-blue-600' : 'text-violet-300'
        }`}
      >
        再読み込み
      </button>
    </div>
  );
}
