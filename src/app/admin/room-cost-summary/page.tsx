'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { downloadCsvFile } from '@/lib/admin-csv-download';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminProductFilterSelect } from '@/components/admin/AdminProductFilterSelect';
import { formatGeminiCostJpyApprox, type GeminiUsageTokenSummary } from '@/lib/gemini-pricing';
import { formatInfraCostJpyApprox } from '@/lib/infra-cost-estimates';

type YoutubeApiCost = {
  calls: number;
  okCalls: number;
  searchCalls: number;
  videosCalls: number;
  quotaUnits: number;
  costJpyApprox: number;
};

type AblyCost = {
  messagesEstimated: number;
  costJpyApprox: number;
};

type RoomCostRow = {
  room_id: string;
  owner_user_id: string | null;
  owner_display_name: string;
  song_count_total: number;
  chat_user_messages: number;
  chat_ai_messages: number;
  gemini: GeminiUsageTokenSummary;
  youtube_api: YoutubeApiCost;
  ably: AblyCost;
  total_cost_jpy_approx: number;
};

type OwnerCostRow = {
  owner_user_id: string;
  owner_display_name: string;
  room_count: number;
  room_ids: string[];
  song_count_total: number;
  gemini: GeminiUsageTokenSummary;
  youtube_api: YoutubeApiCost;
  ably: AblyCost;
  total_cost_jpy_approx: number;
};

export default function AdminRoomCostSummaryPage() {
  const [days, setDays] = useState(30);
  const [roomFilter, setRoomFilter] = useState('');
  const [productFilter, setProductFilter] = useState<'all' | 'musicaichat' | 'musicchat'>('all');
  const [view, setView] = useState<'rooms' | 'owners'>('rooms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomCostRow[]>([]);
  const [owners, setOwners] = useState<OwnerCostRow[]>([]);
  const [totals, setTotals] = useState<{
    rooms: number;
    songs: number;
    geminiCalls: number;
    geminiJpyLabel: string;
    youtubeCalls: number;
    youtubeQuotaUnits: number;
    youtubeJpyLabel: string;
    ablyMessages: number;
    ablyJpyLabel: string;
    totalJpyLabel: string;
    ownerCount: number;
  } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days), product: productFilter });
      if (roomFilter.trim()) params.set('roomId', roomFilter.trim());
      const res = await fetch(`/api/admin/room-cost-summary?${params}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setRooms([]);
        setOwners([]);
        setTotals(null);
        return;
      }
      setRooms((data?.rooms ?? []) as RoomCostRow[]);
      setOwners((data?.owners ?? []) as OwnerCostRow[]);
      setTotals(data?.totals ?? null);
    } catch {
      setError('読み込みに失敗しました。');
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [days, roomFilter, productFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const exportCsv = useCallback(() => {
    if (view === 'owners') {
      if (owners.length === 0) return;
      downloadCsvFile(
        `room-cost-owners-${days}d.csv`,
        [
          'owner_display_name',
          'owner_user_id',
          'room_count',
          'rooms',
          'songs',
          'gemini_calls',
          'gemini_jpy',
          'youtube_calls',
          'youtube_quota_units',
          'youtube_jpy',
          'ably_messages_est',
          'ably_jpy',
          'total_jpy',
        ],
        owners.map((o) => [
          o.owner_display_name,
          o.owner_user_id,
          o.room_count,
          o.room_ids.join('|'),
          o.song_count_total,
          o.gemini.calls,
          Math.round(o.gemini.costJpyApprox * 10) / 10,
          o.youtube_api.calls,
          o.youtube_api.quotaUnits,
          Math.round(o.youtube_api.costJpyApprox * 100) / 100,
          o.ably.messagesEstimated,
          Math.round(o.ably.costJpyApprox * 100) / 100,
          Math.round(o.total_cost_jpy_approx * 10) / 10,
        ]),
      );
      return;
    }
    if (rooms.length === 0) return;
    downloadCsvFile(
      `room-cost-rooms-${days}d.csv`,
      [
        'room_id',
        'owner',
        'songs',
        'gemini_calls',
        'gemini_jpy',
        'youtube_calls',
        'youtube_quota_units',
        'youtube_jpy',
        'chat_user',
        'chat_ai',
        'ably_messages_est',
        'ably_jpy',
        'total_jpy',
      ],
      rooms.map((r) => [
        r.room_id,
        r.owner_display_name,
        r.song_count_total,
        r.gemini.calls,
        Math.round(r.gemini.costJpyApprox * 10) / 10,
        r.youtube_api.calls,
        r.youtube_api.quotaUnits,
        Math.round(r.youtube_api.costJpyApprox * 100) / 100,
        r.chat_user_messages,
        r.chat_ai_messages,
        r.ably.messagesEstimated,
        Math.round(r.ably.costJpyApprox * 100) / 100,
        Math.round(r.total_cost_jpy_approx * 10) / 10,
      ]),
    );
  }, [view, rooms, owners, days]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">部屋原価サマリー</h1>
      <p className="mt-2 text-sm text-gray-400">
        部屋 × 期間の Gemini・YouTube API（クォータ単位→¥目安）・Ably 推定（チャットログ件数ベース）・選曲数。
        YouTube API は <code className="text-gray-500">room_gatherings.created_by</code>（主催者）に帰属します。
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
        <div className="flex rounded border border-gray-700 text-sm">
          <button
            type="button"
            onClick={() => setView('rooms')}
            className={`px-3 py-1 ${view === 'rooms' ? 'bg-gray-800 text-amber-200' : 'text-gray-400'}`}
          >
            部屋別
          </button>
          <button
            type="button"
            onClick={() => setView('owners')}
            className={`px-3 py-1 ${view === 'owners' ? 'bg-gray-800 text-amber-200' : 'text-gray-400'}`}
          >
            主催者別
          </button>
        </div>
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
          disabled={view === 'rooms' ? rooms.length === 0 : owners.length === 0}
          className="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-800 disabled:opacity-40"
        >
          CSV 出力
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      {totals ? (
        <p className="mt-4 text-sm text-gray-300">
          {totals.rooms} 部屋 · 主催者 {totals.ownerCount} · 選曲 {totals.songs} · Gemini {totals.geminiCalls}{' '}
          回 · {totals.geminiJpyLabel}
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
      ) : view === 'owners' ? (
        <div className="mt-6 overflow-x-auto rounded border border-gray-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-900/80 text-gray-400">
              <tr>
                <th className="px-2 py-2">主催者</th>
                <th className="px-2 py-2">部屋数</th>
                <th className="px-2 py-2">選曲</th>
                <th className="px-2 py-2">Gemini</th>
                <th className="px-2 py-2">YT API</th>
                <th className="px-2 py-2">Ably 推定</th>
                <th className="px-2 py-2">合計</th>
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-gray-500">
                    該当データがありません。
                  </td>
                </tr>
              ) : (
                owners.map((o) => (
                  <tr key={o.owner_user_id} className="border-t border-gray-800">
                    <td className="px-2 py-2">
                      <span className="font-medium text-gray-100">{o.owner_display_name}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-gray-600">
                        {o.room_ids.join(', ')}
                      </span>
                    </td>
                    <td className="px-2 py-2">{o.room_count}</td>
                    <td className="px-2 py-2">{o.song_count_total}</td>
                    <td className="px-2 py-2">
                      {o.gemini.calls} / {formatGeminiCostJpyApprox(o.gemini.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2">
                      {o.youtube_api.calls} / {o.youtube_api.quotaUnits.toLocaleString()}u /{' '}
                      {formatInfraCostJpyApprox(o.youtube_api.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2">
                      {o.ably.messagesEstimated} / {formatInfraCostJpyApprox(o.ably.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2 font-medium text-amber-100/90">
                      {formatInfraCostJpyApprox(o.total_cost_jpy_approx)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded border border-gray-800">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-900/80 text-gray-400">
              <tr>
                <th className="px-2 py-2">部屋</th>
                <th className="px-2 py-2">主催者</th>
                <th className="px-2 py-2">選曲</th>
                <th className="px-2 py-2">Gemini</th>
                <th className="px-2 py-2">YT API</th>
                <th className="px-2 py-2">チャット</th>
                <th className="px-2 py-2">Ably 推定</th>
                <th className="px-2 py-2">合計</th>
              </tr>
            </thead>
            <tbody>
              {rooms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-gray-500">
                    該当データがありません。
                  </td>
                </tr>
              ) : (
                rooms.map((row) => (
                  <tr key={row.room_id} className="border-t border-gray-800">
                    <td className="px-2 py-2 font-medium">{row.room_id}</td>
                    <td className="px-2 py-2">{row.owner_display_name}</td>
                    <td className="px-2 py-2">{row.song_count_total}</td>
                    <td className="px-2 py-2">
                      {row.gemini.calls} / {formatGeminiCostJpyApprox(row.gemini.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2">
                      {row.youtube_api.calls} / {row.youtube_api.quotaUnits.toLocaleString()}u /{' '}
                      {formatInfraCostJpyApprox(row.youtube_api.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2 text-gray-500">
                      {row.chat_user_messages}/{row.chat_ai_messages}
                    </td>
                    <td className="px-2 py-2">
                      {row.ably.messagesEstimated} / {formatInfraCostJpyApprox(row.ably.costJpyApprox)}
                    </td>
                    <td className="px-2 py-2 font-medium text-amber-100/90">
                      {formatInfraCostJpyApprox(row.total_cost_jpy_approx)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-600">
        関連:{' '}
        <Link href="/admin/gathering-history" className="text-blue-400 hover:underline">
          12h スロット
        </Link>
        {' · '}
        <Link href="/admin/gathering-history" className="text-blue-400 hover:underline">
          12h スロット
        </Link>
        {' · '}
        <Link href="/admin/user-billing-usage" className="text-blue-400 hover:underline">
          ユーザー別課金
        </Link>
      </p>
    </main>
  );
}
