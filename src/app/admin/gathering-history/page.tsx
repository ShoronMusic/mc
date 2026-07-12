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

type DailySlotRow = {
  slotKey: string;
  slotStartMs: number;
  slotEndMs: number;
  slotLabel: string;
  room_id: string;
  slotComplete: boolean;
  song_count_total: number;
  chat_user_messages: number;
  chat_ai_messages: number;
  unique_participant_users: number;
  gemini: GeminiUsageTokenSummary;
  gemini_by_billing_kind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  gemini_by_category: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
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

type DailySlotUserRow = {
  userId: string;
  displayName: string;
  songCount: number;
  gemini: GeminiUsageTokenSummary;
  byCategory: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  byBillingKind: Partial<Record<GeminiUsageBillingKind, GeminiUsageTokenSummary>>;
  guestOrOtherTriggeredGemini: GeminiUsageTokenSummary;
};

const BILLING_KIND_LABEL: Record<GeminiUsageBillingKind, string> = {
  participant_user: '参加者',
  guest_enjoy_owner_paid: 'ゲスト→主催者',
  room_owner: '主催者（部屋共通）',
  ai_agent: 'AI エージェント',
};

export default function AdminGatheringHistoryPage() {
  const [days, setDays] = useState(14);
  const [roomFilter, setRoomFilter] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'musicaichat' | 'musicchat'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<DailySlotRow[]>([]);
  const [totals, setTotals] = useState<{
    slots: number;
    songs: number;
    geminiCalls: number;
    geminiJpyLabel: string;
    youtubeCalls?: number;
    youtubeQuotaUnits?: number;
    youtubeJpyLabel?: string;
    ablyMessages?: number;
    ablyJpyLabel?: string;
    totalJpyLabel?: string;
  } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSummary, setDetailSummary] = useState<DailySlotRow | null>(null);
  const [detailUsers, setDetailUsers] = useState<DailySlotUserRow[]>([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const params = new URLSearchParams({ days: String(days), product: productFilter });
      if (roomFilter.trim()) params.set('roomId', roomFilter.trim());
      const res = await fetch(`/api/admin/daily-slot-history?${params}`, { credentials: 'include' });
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
      setRows((data?.rows ?? []) as DailySlotRow[]);
      setTotals(data?.totals ?? null);
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, roomFilter, productFilter]);

  const loadDetail = useCallback(async (slotKey: string) => {
    setDetailLoading(true);
    setSelectedKey(slotKey);
    try {
      const res = await fetch(
        `/api/admin/daily-slot-history?slotKey=${encodeURIComponent(slotKey)}&product=${productFilter}`,
        {
          credentials: 'include',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.summary) {
        setDetailSummary(null);
        setDetailUsers([]);
        return;
      }
      setDetailSummary(data.summary as DailySlotRow);
      setDetailUsers((data?.users ?? []) as DailySlotUserRow[]);
    } finally {
      setDetailLoading(false);
    }
  }, [productFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const exportCsv = useCallback(() => {
    if (rows.length === 0) return;
    downloadCsvFile(
      `daily-slot-history-${days}d.csv`,
      [
        'slotLabel',
        'room_id',
        'slotComplete',
        'song_count',
        'gemini_calls',
        'gemini_jpy_approx',
        'youtube_calls',
        'youtube_quota_units',
        'youtube_jpy',
        'ably_messages_est',
        'ably_jpy',
        'total_jpy',
        'chat_user',
        'chat_ai',
      ],
      rows.map((r) => [
        r.slotLabel,
        r.room_id,
        r.slotComplete ? '確定' : '進行中',
        r.song_count_total,
        r.gemini.calls,
        Math.round(r.gemini.costJpyApprox * 10) / 10,
        r.youtube_api?.calls ?? 0,
        r.youtube_api?.quotaUnits ?? 0,
        Math.round((r.youtube_api?.costJpyApprox ?? 0) * 100) / 100,
        r.ably?.messagesEstimated ?? 0,
        Math.round((r.ably?.costJpyApprox ?? 0) * 100) / 100,
        Math.round(r.total_cost_jpy_approx * 10) / 10,
        r.chat_user_messages,
        r.chat_ai_messages,
      ]),
    );
  }, [rows, days]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">開催履歴（12h スロット）</h1>
      <p className="mt-2 text-sm text-gray-400">
        会（gathering）の終了に依存せず、部屋 × 12 時間（06:00–18:00 / 18:00–06:00）単位で選曲・Gemini
        利用量を集計します。マイページの参加履歴と同じ境界です。Gemini 原価は試算値です。
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
            placeholder="例: 02"
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
          集計: {totals.slots} スロット · 選曲 {totals.songs} · Gemini {totals.geminiCalls} 回 ·{' '}
          {totals.geminiJpyLabel}
          {totals.youtubeCalls != null && totals.youtubeCalls > 0
            ? ` · YT API ${totals.youtubeCalls} 回（${(totals.youtubeQuotaUnits ?? 0).toLocaleString()} 単位 · ${totals.youtubeJpyLabel ?? ''}）`
            : ''}
          {(totals.ablyMessages ?? 0) > 0
            ? ` · Ably 推定 ${totals.ablyMessages} 件 · ${totals.ablyJpyLabel ?? ''}`
            : ''}
          {totals.totalJpyLabel ? ` · 合計 ${totals.totalJpyLabel}` : ''}
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
                  <th className="px-2 py-2">スロット</th>
                  <th className="px-2 py-2">部屋</th>
                  <th className="px-2 py-2">選曲</th>
                  <th className="px-2 py-2">Gemini</th>
                  <th className="px-2 py-2">YT API</th>
                  <th className="px-2 py-2">Ably</th>
                  <th className="px-2 py-2">合計</th>
                  <th className="px-2 py-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-gray-500">
                      該当スロットに選曲・AI 利用・チャットの記録がありません。
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.slotKey}
                      className={`cursor-pointer border-t border-gray-800 hover:bg-gray-900/60 ${
                        selectedKey === row.slotKey ? 'bg-violet-950/30' : ''
                      }`}
                      onClick={() => void loadDetail(row.slotKey)}
                    >
                      <td className="px-2 py-2 whitespace-nowrap">{row.slotLabel}</td>
                      <td className="px-2 py-2">{row.room_id}</td>
                      <td className="px-2 py-2">{row.song_count_total}</td>
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
                      <td className="px-2 py-2 text-gray-500">
                        {row.slotComplete ? '確定' : '進行中'}
                      </td>
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
              <p className="text-sm text-gray-500">左の行をクリックすると AI 内訳を表示します。</p>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-violet-200">{detailSummary.slotLabel}</h2>
                <p className="mt-1 text-xs text-gray-400">
                  部屋 {detailSummary.room_id}
                  {detailSummary.slotComplete ? '' : ' · スロット進行中（数値は暫定）'}
                </p>
                <p className="mt-2 text-xs text-gray-300">
                  選曲 {detailSummary.song_count_total} · 参加者（AI 利用）{' '}
                  {detailSummary.unique_participant_users} · チャット user/ai{' '}
                  {detailSummary.chat_user_messages}/{detailSummary.chat_ai_messages}
                </p>
                <p className="mt-1 text-xs text-emerald-300">
                  Gemini: {detailSummary.gemini.calls} 回 ·{' '}
                  {formatGeminiCostJpyApprox(detailSummary.gemini.costJpyApprox)} ·{' '}
                  {detailSummary.gemini.promptTokens.toLocaleString()} in /{' '}
                  {detailSummary.gemini.outputTokens.toLocaleString()} out
                </p>
                {(detailSummary.youtube_api?.calls ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-sky-300/90">
                    YouTube API: {detailSummary.youtube_api.calls} 回 ·{' '}
                    {detailSummary.youtube_api.quotaUnits.toLocaleString()} 単位 ·{' '}
                    {formatInfraCostJpyApprox(detailSummary.youtube_api.costJpyApprox)}（成功{' '}
                    {detailSummary.youtube_api.okCalls} · search{' '}
                    {detailSummary.youtube_api.searchCalls} · videos{' '}
                    {detailSummary.youtube_api.videosCalls}）
                  </p>
                ) : null}
                {(detailSummary.ably?.messagesEstimated ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-violet-300/90">
                    Ably 推定: {detailSummary.ably.messagesEstimated} 件 ·{' '}
                    {formatInfraCostJpyApprox(detailSummary.ably.costJpyApprox)}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-medium text-amber-200/90">
                  合計試算: {formatInfraCostJpyApprox(detailSummary.total_cost_jpy_approx)}
                </p>

                <div className="mt-3">
                  <GeminiUsageCategoryBreakdown
                    byCategory={detailSummary.gemini_by_category}
                    title="3分類内訳"
                    compact
                  />
                </div>

                {Object.keys(detailSummary.gemini_by_billing_kind).length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-gray-400">
                    <li className="font-medium text-gray-300">billing_kind</li>
                    {(Object.entries(detailSummary.gemini_by_billing_kind) as [
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

                {detailUsers.length > 0 ? (
                  <>
                    <p className="mt-3 text-xs font-medium text-gray-300">
                      参加者別（請求先 billing_user_id · 試算）
                    </p>
                    <ul className="mt-1 max-h-64 space-y-2 overflow-y-auto">
                      {detailUsers.map((u) => (
                        <li
                          key={u.userId}
                          className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5 text-xs"
                        >
                          <span className="font-medium text-gray-100">{u.displayName}</span>
                          <span className="ml-2 text-gray-400">選曲 {u.songCount}</span>
                          <span className="mt-0.5 block text-emerald-300/90">
                            Gemini {u.gemini.calls} 回 ·{' '}
                            {formatGeminiCostJpyApprox(u.gemini.costJpyApprox)}
                          </span>
                          {u.guestOrOtherTriggeredGemini.calls > 0 ? (
                            <span className="mt-0.5 block text-amber-300/80">
                              他人操作分: {u.guestOrOtherTriggeredGemini.calls} 回
                            </span>
                          ) : null}
                          <Link
                            href={`/admin/user-billing-usage?userId=${encodeURIComponent(u.userId)}${
                              productFilter !== 'all' ? `&product=${productFilter}` : ''
                            }`}
                            className="mt-1 inline-block text-[10px] text-blue-400/80 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ユーザー別画面で期間集計 →
                          </Link>
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
        会終了時のスナップショット（補助・滅多に発生）:{' '}
        <code className="text-gray-500">room_gathering_snapshots</code> —{' '}
        <Link href="/admin/user-billing-usage" className="text-blue-400 hover:underline">
          ユーザー別 AI 利用
        </Link>
        {' · '}
        <Link href="/admin/gemini-usage" className="text-blue-400 hover:underline">
          Gemini 利用ログ
        </Link>
        {' · '}
        <Link href="/admin/room-daily-summary" className="text-blue-400 hover:underline">
          部屋日次サマリー
        </Link>
      </p>
    </main>
  );
}
