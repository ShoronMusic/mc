'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { downloadCsvFile } from '@/lib/admin-csv-download';
import type {
  AdminAiTrialAbuseEventRow,
  AdminAiTrialConsumptionLogRow,
  AdminTrialRowPhase,
  AdminTrialStatusFilter,
  AdminUserAiTrialListRow,
  AdminUserAiTrialOverview,
} from '@/lib/admin-user-ai-trial-aggregate';
import type { AdminAiCreditTransactionRow } from '@/lib/user-ai-credits-server';

const PHASE_LABEL: Record<AdminTrialRowPhase, string> = {
  active: 'お試し中',
  exhausted: '使い切り',
  songs_only: '曲のみ残',
  at_only: '@のみ残',
};

const STATUS_OPTIONS: { value: AdminTrialStatusFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'active', label: '曲 残あり' },
  { value: 'exhausted', label: '曲 使い切り' },
  { value: 'at_remaining', label: '@ 残あり' },
  { value: 'partial', label: '片方のみ残' },
];

function formatJst(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function phasePillClass(phase: AdminTrialRowPhase): string {
  switch (phase) {
    case 'active':
      return 'border-emerald-600/60 bg-emerald-950/40 text-emerald-200';
    case 'exhausted':
      return 'border-gray-600 bg-gray-900/60 text-gray-300';
    case 'songs_only':
      return 'border-amber-600/60 bg-amber-950/40 text-amber-200';
    case 'at_only':
      return 'border-violet-600/60 bg-violet-950/40 text-violet-200';
    default:
      return 'border-gray-700 text-gray-400';
  }
}

function consumptionKindLabel(kind: AdminAiTrialConsumptionLogRow['kind']): string {
  return kind === 'at_question' ? '@ 質問' : 'AI付き選曲';
}

export default function AdminUserAiTrialPage() {
  const [status, setStatus] = useState<AdminTrialStatusFilter>('all');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [sort, setSort] = useState<'updated_desc' | 'created_desc' | 'songs_remaining_asc'>(
    'updated_desc',
  );
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminUserAiTrialOverview | null>(null);
  const [rows, setRows] = useState<AdminUserAiTrialListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [enforcementEnabled, setEnforcementEnabled] = useState(false);
  const [abuseEvents, setAbuseEvents] = useState<AdminAiTrialAbuseEventRow[]>([]);
  const [abuseEventsMissingTable, setAbuseEventsMissingTable] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRow, setDetailRow] = useState<AdminUserAiTrialListRow | null>(null);
  const [consumptionLogs, setConsumptionLogs] = useState<AdminAiTrialConsumptionLogRow[]>([]);
  const [consumptionLogError, setConsumptionLogError] = useState<string | null>(null);
  const [creditTransactions, setCreditTransactions] = useState<AdminAiCreditTransactionRow[]>([]);
  const [creditTransactionsError, setCreditTransactionsError] = useState<string | null>(null);
  const [creditsTableMissing, setCreditsTableMissing] = useState(false);
  const [grantCredits, setGrantCredits] = useState('40');
  const [grantNote, setGrantNote] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const params = new URLSearchParams({
        status,
        sort,
        limit: String(limit),
        offset: String(offset),
      });
      if (appliedQ.trim()) params.set('q', appliedQ.trim());
      const res = await fetch(`/api/admin/user-ai-trial?${params}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setRows([]);
        setOverview(null);
        return;
      }
      if (data?.enabled === false) {
        setHint(data?.hint ?? 'user_ai_trial テーブルが未作成です。');
        setRows([]);
        setOverview(null);
        return;
      }
      setOverview(data.overview ?? null);
      setRows((data?.rows ?? []) as AdminUserAiTrialListRow[]);
      setTotal(Number(data?.total) || 0);
      setEnforcementEnabled(Boolean(data?.enforcementEnabled));
      setAbuseEvents((data?.abuseEvents ?? []) as AdminAiTrialAbuseEventRow[]);
      setAbuseEventsMissingTable(Boolean(data?.abuseEventsMissingTable));
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, appliedQ, sort, offset]);

  const loadDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setSelectedId(userId);
    try {
      const res = await fetch(`/api/admin/user-ai-trial?userId=${encodeURIComponent(userId)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.detail) {
        setDetailRow(null);
        setConsumptionLogs([]);
        setConsumptionLogError(null);
        setCreditTransactions([]);
        setCreditTransactionsError(null);
        setCreditsTableMissing(false);
        return;
      }
      setDetailRow(data.detail.row);
      setConsumptionLogs(data.detail.consumptionLogs ?? []);
      setConsumptionLogError(data.detail.consumptionLogError ?? null);
      setCreditTransactions(data.detail.creditTransactions ?? []);
      setCreditTransactionsError(data.detail.creditTransactionsError ?? null);
      setCreditsTableMissing(Boolean(data.detail.creditsTableMissing));
      setGrantMessage(null);
    } catch {
      setDetailRow(null);
      setConsumptionLogs([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const submitGrant = async () => {
    if (!detailRow) return;
    const credits = parseInt(grantCredits, 10);
    if (!Number.isFinite(credits) || credits <= 0) {
      setGrantMessage('クレジット数は正の整数を入力してください。');
      return;
    }
    setGrantLoading(true);
    setGrantMessage(null);
    try {
      const res = await fetch('/api/admin/user-ai-credits/grant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: detailRow.userId,
          credits,
          note: grantNote.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGrantMessage(data?.error ?? data?.hint ?? '付与に失敗しました。');
        return;
      }
      setGrantMessage(`付与しました。残 ${data.creditsRemaining} クレジット`);
      setGrantNote('');
      void loadDetail(detailRow.userId);
      void loadList();
    } catch {
      setGrantMessage('付与に失敗しました。');
    } finally {
      setGrantLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const applySearch = () => {
    setOffset(0);
    setAppliedQ(q);
  };

  const exportCsv = () => {
    const headers = [
      'user_id',
      'email',
      'display_name',
      'phase',
      'songs_remaining',
      'songs_used',
      'at_remaining',
      'at_used',
      'credits_remaining',
      'first_ip',
      'last_ip',
      'created_at',
      'updated_at',
    ];
    const csvRows = rows.map((r) => [
      r.userId,
      r.email ?? '',
      r.displayName,
      PHASE_LABEL[r.phase],
      r.songsRemaining,
      r.songsUsed,
      r.atQuestionsRemaining,
      r.atQuestionsUsed,
      r.creditsRemaining ?? '',
      r.firstIp ?? '',
      r.lastIp ?? '',
      r.createdAt,
      r.updatedAt,
    ]);
    downloadCsvFile(`ai-trial-users-${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageIndex = Math.floor(offset / limit) + 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-gray-100">
      <AdminMenuBar />
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-white">AI お試しユーザー管理</h1>
        <p className="mt-1 text-sm text-gray-400">
          一般ユーザーの `user_ai_trial` のみ表示。管理者（`STYLE_ADMIN_USER_IDS`・開発者無制限）は除外。
        </p>
      </header>

      {hint && (
        <p className="mb-4 rounded-lg border border-amber-800/80 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {hint}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-800/80 bg-red-950/30 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      )}

      {overview && (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
            <p className="text-xs text-gray-500">登録 trial ユーザー</p>
            <p className="text-2xl font-semibold text-white">{overview.totalUsers}</p>
            <p className="mt-1 text-xs text-gray-500">
              曲残あり {overview.activeUsers} · 使い切り {overview.exhaustedUsers}
              {overview.excludedAdminUsers > 0 && (
                <> · 管理者除外 {overview.excludedAdminUsers}</>
              )}
            </p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
            <p className="text-xs text-gray-500">直近の更新</p>
            <p className="text-lg font-semibold text-white">
              24h: {overview.updatedLast24h} · 7d: {overview.updatedLast7d}
            </p>
            <p className="mt-1 text-xs text-gray-500">@ 残あり {overview.atRemainingUsers} 人</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
            <p className="text-xs text-gray-500">強制（enforcement）</p>
            <p className={`text-lg font-semibold ${enforcementEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
              {enforcementEnabled ? 'ON' : 'OFF（preview）'}
            </p>
            <p className="mt-1 text-xs text-gray-500">`AI_TRIAL_ENFORCEMENT_ENABLED`</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3">
            <p className="text-xs text-gray-500">消費ログ / クレジット</p>
            <p className={`text-lg font-semibold ${overview.consumptionLogEnabled ? 'text-emerald-300' : 'text-gray-400'}`}>
              ログ: {overview.consumptionLogEnabled ? 'あり' : '未作成'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              クレジット: {overview.creditsEnabled ? (overview.creditsTableMissing ? 'テーブル未作成' : 'ON') : 'OFF'}
              {' · '}
              付与拒否 24h: {overview.abuseEventEnabled ? overview.abuseEventsLast24h : '—'}
            </p>
          </div>
        </section>
      )}

      {abuseEventsMissingTable ? (
        <p className="mb-4 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-xs text-gray-400">
          付与拒否イベント表（`user_ai_trial_abuse_event`）が未作成です。SQL は{' '}
          <code className="text-gray-300">docs/supabase-user-ai-trial-table.md</code> を参照。
        </p>
      ) : null}

      {abuseEvents.length > 0 ? (
        <section className="mb-6 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
          <h2 className="text-sm font-semibold text-amber-100">付与拒否・不正抑制イベント（直近）</h2>
          <p className="mt-1 text-xs text-amber-100/70">
            IP ソフト上限・メール待機での付与拒否。サーバーログにも `[ai-trial-abuse]` で出力されます。
          </p>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
            {abuseEvents.map((ev) => (
              <li
                key={ev.id}
                className="rounded border border-amber-900/40 bg-black/20 px-2 py-1.5 font-mono text-amber-50/90"
              >
                <span className="text-amber-200">{formatJst(ev.createdAt)}</span>
                {' · '}
                <span>{ev.kind}</span>
                {' · '}
                <span className="text-gray-300">{ev.userId.slice(0, 8)}…</span>
                {ev.clientIp ? (
                  <>
                    {' · IP '}
                    <span>{ev.clientIp}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          状態
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdminTrialStatusFilter);
              setOffset(0);
            }}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-gray-400">
          検索（user_id / メール）
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="UUID またはメールの一部"
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          並び
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setOffset(0);
            }}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100"
          >
            <option value="updated_desc">更新が新しい順</option>
            <option value="created_desc">付与が新しい順</option>
            <option value="songs_remaining_asc">曲残数が少ない順</option>
          </select>
        </label>
        <button
          type="button"
          onClick={applySearch}
          className="rounded bg-amber-700/80 px-3 py-1.5 text-sm text-white hover:bg-amber-600/90"
        >
          検索
        </button>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loading}
          className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
        >
          再読込
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
        >
          CSV（表示中）
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(18rem,22rem)]">
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="min-w-[44rem] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/80 text-xs text-gray-400">
                <th className="px-3 py-2 font-medium">ユーザー</th>
                <th className="px-3 py-2 font-medium">状態</th>
                <th className="px-3 py-2 font-medium">曲</th>
                <th className="px-3 py-2 font-medium">@</th>
                <th className="px-3 py-2 font-medium">クレジット</th>
                <th className="px-3 py-2 font-medium">最終更新</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    読み込み中…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    該当ユーザーがありません。
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const selected = selectedId === row.userId;
                  return (
                    <tr
                      key={row.userId}
                      className={`cursor-pointer border-b border-gray-900/80 ${selected ? 'bg-amber-950/25' : 'hover:bg-gray-900/50'}`}
                      onClick={() => void loadDetail(row.userId)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-100">{row.displayName}</div>
                        <div className="font-mono text-[10px] text-gray-500">{row.userId}</div>
                        {row.email && <div className="text-xs text-gray-400">{row.email}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${phasePillClass(row.phase)}`}
                        >
                          {PHASE_LABEL[row.phase]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-200">
                        残 {row.songsRemaining}/{row.songsGranted}
                        <span className="ml-1 text-xs text-gray-500">（使用 {row.songsUsed}）</span>
                      </td>
                      <td className="px-3 py-2 text-gray-200">
                        残 {row.atQuestionsRemaining}/{row.atQuestionsGranted}
                      </td>
                      <td className="px-3 py-2 text-gray-200">
                        {row.creditsEnabled
                          ? row.creditsRemaining != null
                            ? `残 ${row.creditsRemaining}`
                            : '—'
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">{formatJst(row.updatedAt)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 text-sm">
          <h2 className="mb-3 font-medium text-gray-200">詳細</h2>
          {!selectedId && <p className="text-gray-500">一覧からユーザーを選択</p>}
          {selectedId && detailLoading && <p className="text-gray-500">読み込み中…</p>}
          {selectedId && !detailLoading && detailRow && (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-white">{detailRow.displayName}</p>
                <p className="break-all font-mono text-[10px] text-gray-500">{detailRow.userId}</p>
                {detailRow.email && <p className="text-xs text-gray-300">{detailRow.email}</p>}
              </div>
              <dl className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between gap-2">
                  <dt>曲</dt>
                  <dd className="text-gray-200">
                    残 {detailRow.songsRemaining} / 使用 {detailRow.songsUsed}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>@</dt>
                  <dd className="text-gray-200">
                    残 {detailRow.atQuestionsRemaining} / 使用 {detailRow.atQuestionsUsed}
                  </dd>
                </div>
                {detailRow.creditsEnabled && (
                  <div className="flex justify-between gap-2">
                    <dt>クレジット</dt>
                    <dd className="text-gray-200">
                      {creditsTableMissing
                        ? 'テーブル未作成'
                        : `残 ${detailRow.creditsRemaining ?? 0}`}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt>付与</dt>
                  <dd>{formatJst(detailRow.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>更新</dt>
                  <dd>{formatJst(detailRow.updatedAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>first_ip</dt>
                  <dd className="font-mono text-[10px]">{detailRow.firstIp ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>last_ip</dt>
                  <dd className="font-mono text-[10px]">{detailRow.lastIp ?? '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/admin/user-billing-usage?userId=${encodeURIComponent(detailRow.userId)}`}
                  className="text-xs text-amber-200/90 hover:text-amber-100"
                >
                  AI 利用（課金帰属）→
                </Link>
              </div>
              {detailRow.creditsEnabled && !creditsTableMissing && (
                <div className="rounded border border-violet-800/60 bg-violet-950/20 p-3">
                  <h3 className="mb-2 text-xs font-medium text-violet-200">クレジット手動付与（段階1）</h3>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-xs text-gray-400">
                      付与数
                      <input
                        type="number"
                        min={1}
                        value={grantCredits}
                        onChange={(e) => setGrantCredits(e.target.value)}
                        className="mt-1 block w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
                      />
                    </label>
                    <label className="min-w-[8rem] flex-1 text-xs text-gray-400">
                      メモ（任意）
                      <input
                        type="text"
                        value={grantNote}
                        onChange={(e) => setGrantNote(e.target.value)}
                        className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
                        placeholder="テスト付与など"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={grantLoading}
                      onClick={() => void submitGrant()}
                      className="rounded border border-violet-600 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-900/40 disabled:opacity-50"
                    >
                      {grantLoading ? '付与中…' : '付与'}
                    </button>
                  </div>
                  {grantMessage && <p className="mt-2 text-xs text-violet-200">{grantMessage}</p>}
                </div>
              )}
              <div>
                <h3 className="mb-1 text-xs font-medium text-gray-400">消費ログ（最大100件）</h3>
                {consumptionLogError && (
                  <p className="text-xs text-red-300">{consumptionLogError}</p>
                )}
                {consumptionLogs.length === 0 && !consumptionLogError && (
                  <p className="text-xs text-gray-500">ログなし（テーブル未作成または未記録）</p>
                )}
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {consumptionLogs.map((log) => (
                    <li key={log.id} className="rounded border border-gray-800/80 px-2 py-1 text-gray-300">
                      <span className="text-gray-400">{formatJst(log.createdAt)}</span>{' '}
                      {consumptionKindLabel(log.kind)}
                      {log.videoId && (
                        <span className="ml-1 font-mono text-[10px] text-gray-500">{log.videoId}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {detailRow.creditsEnabled && (
                <div>
                  <h3 className="mb-1 text-xs font-medium text-gray-400">クレジット取引（最大50件）</h3>
                  {creditTransactionsError && (
                    <p className="text-xs text-red-300">{creditTransactionsError}</p>
                  )}
                  {creditsTableMissing && (
                    <p className="text-xs text-amber-300">user_ai_credits 未作成（docs/supabase-user-ai-credits-table.md）</p>
                  )}
                  {creditTransactions.length === 0 && !creditTransactionsError && !creditsTableMissing && (
                    <p className="text-xs text-gray-500">取引なし</p>
                  )}
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                    {creditTransactions.map((tx) => (
                      <li key={tx.id} className="rounded border border-gray-800/80 px-2 py-1 text-gray-300">
                        <span className="text-gray-400">{formatJst(tx.createdAt)}</span>{' '}
                        {tx.kind} {tx.delta > 0 ? '+' : ''}
                        {tx.delta} → 残 {tx.balanceAfter}
                        {tx.note && <span className="ml-1 text-gray-500">({tx.note})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {total > limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
          <span>
            {total} 件中 {offset + 1}–{Math.min(offset + limit, total)} 件（{pageIndex}/{pageCount} ページ）
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset <= 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              className="rounded border border-gray-700 px-2 py-1 disabled:opacity-40"
            >
              前へ
            </button>
            <button
              type="button"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset((o) => o + limit)}
              className="rounded border border-gray-700 px-2 py-1 disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
