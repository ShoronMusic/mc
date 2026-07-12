'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { downloadCsvFile } from '@/lib/admin-csv-download';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminProductFilterSelect } from '@/components/admin/AdminProductFilterSelect';
import { GeminiUsageCategoryBreakdown } from '@/components/mypage/GeminiUsageCategoryBreakdown';
import { formatGeminiCostJpyApprox, type GeminiUsageTokenSummary } from '@/lib/gemini-pricing';
import { formatInfraCostJpyApprox } from '@/lib/infra-cost-estimates';
import type { GeminiUsageBillingKind } from '@/lib/gemini-usage-attribution';
import type { GeminiUsageCategoryId } from '@/lib/gemini-usage-categories';

type UserBillingRow = {
  userId: string;
  displayName: string;
  songCount: number;
  roomCount: number;
  slotCount: number;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingKind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  guestOrOtherTriggeredGemini: GeminiUsageTokenSummary;
  youtube_api: {
    calls: number;
    okCalls: number;
    searchCalls: number;
    videosCalls: number;
    quotaUnits: number;
    costJpyApprox: number;
  };
  ably: { messagesEstimated: number; costJpyApprox: number };
  total_cost_jpy_approx: number;
};

type UserSlotRow = {
  slotKey: string;
  slotLabel: string;
  room_id: string;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  songCount: number;
};

const BILLING_KIND_LABEL: Record<GeminiUsageBillingKind, string> = {
  participant_user: '参加者本人',
  guest_enjoy_owner_paid: 'ゲスト→主催者',
  room_owner: '主催者（部屋共通）',
  ai_agent: 'AI エージェント',
};

export default function AdminUserBillingUsagePage() {
  const [days, setDays] = useState(30);
  const [roomFilter, setRoomFilter] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'musicaichat' | 'musicchat'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<UserBillingRow[]>([]);
  const [totals, setTotals] = useState<{
    users: number;
    songs: number;
    geminiCalls: number;
    geminiJpyLabel: string;
    youtubeCalls: number;
    youtubeQuotaUnits: number;
    youtubeJpyLabel: string;
    ablyMessages: number;
    ablyJpyLabel: string;
    totalJpyLabel: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSummary, setDetailSummary] = useState<UserBillingRow | null>(null);
  const [detailSlots, setDetailSlots] = useState<UserSlotRow[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const params = new URLSearchParams({ days: String(days), product: productFilter });
      if (roomFilter.trim()) params.set('roomId', roomFilter.trim());
      const res = await fetch(`/api/admin/user-billing-usage?${params}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setRows([]);
        setTotals(null);
        return;
      }
      if (data?.enabled === false) {
        setHint(data?.hint ?? 'gemini_usage_logs テーブルが未作成です。');
        setRows([]);
        setTotals(null);
        return;
      }
      setRows((data?.rows ?? []) as UserBillingRow[]);
      setTotals(data?.totals ?? null);
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, roomFilter, productFilter]);

  const loadDetail = useCallback(
    async (userId: string) => {
      setDetailLoading(true);
      setSelectedId(userId);
      try {
        const res = await fetch(
          `/api/admin/user-billing-usage?userId=${encodeURIComponent(userId)}&days=${days}&product=${productFilter}`,
          { credentials: 'include' },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.summary) {
          setDetailSummary(null);
          setDetailSlots([]);
          return;
        }
        setDetailSummary(data.summary as UserBillingRow);
        setDetailSlots((data?.slots ?? []) as UserSlotRow[]);
      } finally {
        setDetailLoading(false);
      }
    },
    [days, productFilter],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const preselect = new URLSearchParams(window.location.search).get('userId')?.trim();
    if (preselect) void loadDetail(preselect);
  }, [loadDetail]);

  const exportCsv = useCallback(() => {
    if (rows.length === 0) return;
    downloadCsvFile(
      `user-billing-usage-${days}d.csv`,
      [
        'displayName',
        'userId',
        'songCount',
        'gemini_calls',
        'gemini_jpy_approx',
        'commentary_calls',
        'at_question_calls',
        'other_calls',
        'guest_triggered_calls',
        'youtube_api_calls',
        'youtube_quota_units',
        'youtube_jpy',
        'ably_messages_est',
        'ably_jpy',
        'total_jpy',
        'roomCount',
        'slotCount',
      ],
      rows.map((r) => [
        r.displayName,
        r.userId,
        r.songCount,
        r.gemini.calls,
        Math.round(r.gemini.costJpyApprox * 10) / 10,
        r.byCategory.commentary.calls,
        r.byCategory.at_question.calls,
        r.byCategory.other.calls,
        r.guestOrOtherTriggeredGemini.calls,
        r.youtube_api?.calls ?? 0,
        r.youtube_api?.quotaUnits ?? 0,
        Math.round((r.youtube_api?.costJpyApprox ?? 0) * 100) / 100,
        r.ably?.messagesEstimated ?? 0,
        Math.round((r.ably?.costJpyApprox ?? 0) * 100) / 100,
        Math.round(r.total_cost_jpy_approx * 10) / 10,
        r.roomCount,
        r.slotCount,
      ]),
    );
  }, [rows, days]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">ユーザー別 AI 利用（課金帰属）</h1>
      <p className="mt-2 text-sm text-gray-400">
        Gemini ログの <code className="text-gray-500">billing_user_id</code>{' '}
        を請求先として集計します。YouTube API・Ably 推定は主催部屋の原価としてオーナーに帰属（試算値）。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-400">
          直近
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="ml-2 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d}日
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-400">
          部屋
          <input
            type="text"
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            placeholder="任意"
            className="ml-2 w-20 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100"
          />
        </label>
        <AdminProductFilterSelect value={productFilter} onChange={setProductFilter} />
        <button
          type="button"
          onClick={() => void loadList()}
          className="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800"
        >
          再読み込み
        </button>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-40"
        >
          CSV 出力
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      {hint ? (
        <p className="mt-4 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          {hint}
        </p>
      ) : null}

      {totals && !hint ? (
        <p className="mt-4 text-sm text-gray-300">
          集計: {totals.users} ユーザー · 選曲 {totals.songs} · Gemini {totals.geminiCalls} 回 ·{' '}
          {totals.geminiJpyLabel}
          {totals.youtubeCalls > 0
            ? ` · YT API ${totals.youtubeCalls} 回（${totals.youtubeQuotaUnits.toLocaleString()} 単位 · ${totals.youtubeJpyLabel}）`
            : ''}
          {totals.ablyMessages > 0 ? ` · Ably 推定 ${totals.ablyMessages} 件 · ${totals.ablyJpyLabel}` : ''}
          {' · 合計 '}
          {totals.totalJpyLabel}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">読み込み中…</p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded border border-gray-800">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-900/80 text-gray-400">
                <tr>
                  <th className="px-2 py-2">ユーザー</th>
                  <th className="px-2 py-2">選曲</th>
                  <th className="px-2 py-2">Gemini</th>
                  <th className="px-2 py-2">YT API</th>
                  <th className="px-2 py-2">Ably</th>
                  <th className="px-2 py-2">合計</th>
                  <th className="px-2 py-2">部屋</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-gray-500">
                      該当データがありません。
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.userId}
                      className={`cursor-pointer border-t border-gray-800 hover:bg-gray-900/60 ${
                        selectedId === row.userId ? 'bg-violet-950/30' : ''
                      }`}
                      onClick={() => void loadDetail(row.userId)}
                    >
                      <td className="px-2 py-2">
                        <span className="font-medium text-gray-100">{row.displayName}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-gray-600">
                          {row.userId.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-2 py-2">{row.songCount}</td>
                      <td className="px-2 py-2">
                        {row.gemini.calls} / {formatGeminiCostJpyApprox(row.gemini.costJpyApprox)}
                      </td>
                      <td className="px-2 py-2 text-gray-400">
                        {row.youtube_api?.calls ?? 0} / {(row.youtube_api?.quotaUnits ?? 0).toLocaleString()}u /{' '}
                        {formatInfraCostJpyApprox(row.youtube_api?.costJpyApprox ?? 0)}
                      </td>
                      <td className="px-2 py-2 text-gray-400">
                        {row.ably?.messagesEstimated ?? 0} /{' '}
                        {formatInfraCostJpyApprox(row.ably?.costJpyApprox ?? 0)}
                      </td>
                      <td className="px-2 py-2 font-medium text-amber-100/90">
                        {formatInfraCostJpyApprox(row.total_cost_jpy_approx)}
                      </td>
                      <td className="px-2 py-2">{row.roomCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-gray-800 bg-gray-900/40 p-3">
            {detailLoading ? (
              <p className="text-sm text-gray-500">詳細を読み込み中…</p>
            ) : !detailSummary ? (
              <p className="text-sm text-gray-500">左の行をクリックするとスロット内訳を表示します。</p>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-violet-200">{detailSummary.displayName}</h2>
                <p className="mt-1 font-mono text-[10px] text-gray-600">{detailSummary.userId}</p>
                <p className="mt-2 text-xs text-gray-300">
                  選曲 {detailSummary.songCount} · 部屋 {detailSummary.roomCount} · スロット{' '}
                  {detailSummary.slotCount}
                </p>
                <p className="mt-1 text-xs text-emerald-300">
                  Gemini（請求先）: {detailSummary.gemini.calls} 回 ·{' '}
                  {formatGeminiCostJpyApprox(detailSummary.gemini.costJpyApprox)}
                </p>
                {detailSummary.guestOrOtherTriggeredGemini.calls > 0 ? (
                  <p className="mt-1 text-xs text-amber-300/90">
                    うち他人操作で主催者負担: {detailSummary.guestOrOtherTriggeredGemini.calls} 回 ·{' '}
                    {formatGeminiCostJpyApprox(detailSummary.guestOrOtherTriggeredGemini.costJpyApprox)}
                  </p>
                ) : null}
                {(detailSummary.youtube_api?.calls ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-sky-300/90">
                    YouTube API（主催部屋）: {detailSummary.youtube_api.calls} 回 ·{' '}
                    {detailSummary.youtube_api.quotaUnits.toLocaleString()} 単位 ·{' '}
                    {formatInfraCostJpyApprox(detailSummary.youtube_api.costJpyApprox)}（成功{' '}
                    {detailSummary.youtube_api.okCalls}）
                  </p>
                ) : null}
                {(detailSummary.ably?.messagesEstimated ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-violet-300/90">
                    Ably 推定（主催部屋）: {detailSummary.ably.messagesEstimated} 件 ·{' '}
                    {formatInfraCostJpyApprox(detailSummary.ably.costJpyApprox)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-medium text-amber-200/90">
                  合計試算: {formatInfraCostJpyApprox(detailSummary.total_cost_jpy_approx)}
                </p>

                <div className="mt-3">
                  <GeminiUsageCategoryBreakdown
                    byCategory={detailSummary.byCategory}
                    title="3分類内訳"
                    compact
                  />
                </div>

                {Object.keys(detailSummary.byBillingKind).length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-gray-400">
                    <li className="font-medium text-gray-300">billing_kind</li>
                    {(Object.entries(detailSummary.byBillingKind) as [
                      GeminiUsageBillingKind,
                      GeminiUsageTokenSummary,
                    ][]).map(([kind, g]) => (
                      <li key={kind}>
                        {BILLING_KIND_LABEL[kind] ?? kind}: {g.calls} 回 ·{' '}
                        {formatGeminiCostJpyApprox(g.costJpyApprox)}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {detailSlots.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs font-medium text-gray-300">12h スロット内訳</p>
                    <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto">
                      {detailSlots.map((s) => (
                        <li
                          key={s.slotKey}
                          className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5 text-xs"
                        >
                          <span className="text-gray-200">{s.slotLabel}</span>
                          <span className="ml-1 text-gray-500">部屋 {s.room_id}</span>
                          <span className="mt-0.5 block text-gray-400">
                            選曲 {s.songCount} · Gemini {s.gemini.calls} 回 ·{' '}
                            {formatGeminiCostJpyApprox(s.gemini.costJpyApprox)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-600">
        関連:{' '}
        <Link href="/admin/room-cost-summary" className="text-blue-400 hover:underline">
          部屋原価サマリー
        </Link>
        {' · '}
        <Link href="/admin/gemini-usage" className="text-blue-400 hover:underline">
          Gemini 利用ログ
        </Link>
        {' · '}
        <Link href="/admin/youtube-api-usage" className="text-blue-400 hover:underline">
          YouTube API 利用ログ
        </Link>
      </p>
    </main>
  );
}
