'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type SummaryResponse = {
  error?: string;
  hint?: string;
  totals?: { selections: number; artists: number; tracks: number; rooms: number };
  byPeriod?: Array<{ period: string; count: number }>;
  byArtist?: Array<{ artist: string; count: number }>;
  styleDistribution?: Array<{ style: string; count: number }>;
  eraDistribution?: Array<{ era: string; count: number }>;
  popularTracks?: Array<{ artist: string; title: string; videoId: string; count: number }>;
  scanned?: number;
  truncated?: boolean;
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminRoomPlaybackGlobalSummaryPage() {
  const [granularity, setGranularity] = useState<'day' | 'month' | 'year'>('day');
  const [from, setFrom] = useState(toDateInputValue(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const q = new URLSearchParams({
        granularity,
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`,
      });
      const res = await fetch(`/api/admin/room-playback-global-summary?${q.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json().catch(() => ({}))) as SummaryResponse;
      if (!res.ok) {
        setError(json.error ?? '読み込みに失敗しました。');
        setHint(json.hint ?? null);
        setData({});
        return;
      }
      setData(json);
    } catch {
      setError('読み込みに失敗しました。');
      setData({});
    } finally {
      setLoading(false);
    }
  }, [granularity, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">ルーム横断 選曲全集計</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              集計単位
              <select
                value={granularity}
                onChange={(e) => setGranularity((e.target.value as 'day' | 'month' | 'year') ?? 'day')}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value="day">日別</option>
                <option value="month">月別</option>
                <option value="year">年別</option>
              </select>
            </label>
            <label className="text-sm">
              from
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              />
            </label>
            <label className="text-sm">
              to
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="ml-2 rounded border border-gray-600 bg-gray-800 px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            <p>{error}</p>
            {hint && <p className="text-sm text-amber-300/90">{hint}</p>}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <div className="text-xs text-gray-500">総選曲数</div>
                <div className="text-xl font-semibold">{(data.totals?.selections ?? 0).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <div className="text-xs text-gray-500">アーティスト数</div>
                <div className="text-xl font-semibold">{(data.totals?.artists ?? 0).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <div className="text-xs text-gray-500">人気曲候補数</div>
                <div className="text-xl font-semibold">{(data.totals?.tracks ?? 0).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <div className="text-xs text-gray-500">対象ルーム数</div>
                <div className="text-xl font-semibold">{(data.totals?.rooms ?? 0).toLocaleString()}</div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <h2 className="mb-2 text-sm font-medium text-gray-300">選曲数推移（{granularity}）</h2>
                <div className="max-h-[260px] overflow-auto pr-2">
                  {(data.byPeriod ?? []).map((r) => (
                    <div key={r.period} className="flex justify-between border-b border-gray-800 py-1 pr-2 text-sm">
                      <span className="text-gray-300">{r.period}</span>
                      <span className="min-w-[3.5rem] pr-2 text-right tabular-nums">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <h2 className="mb-2 text-sm font-medium text-gray-300">人気アーティスト（TOP100）</h2>
                <div className="max-h-[260px] overflow-auto pr-2">
                  {(data.byArtist ?? []).map((r) => (
                    <div key={r.artist} className="flex justify-between border-b border-gray-800 py-1 pr-2 text-sm">
                      <span className="text-gray-300">{r.artist}</span>
                      <span className="min-w-[3.5rem] pr-2 text-right tabular-nums">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <h2 className="mb-2 text-sm font-medium text-gray-300">時代分布</h2>
                {(data.eraDistribution ?? []).map((r) => (
                  <div key={r.era} className="flex justify-between border-b border-gray-800 py-1 pr-2 text-sm">
                    <span className="text-gray-300">{r.era}</span>
                    <span className="min-w-[3.5rem] pr-2 text-right tabular-nums">{r.count}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                <h2 className="mb-2 text-sm font-medium text-gray-300">スタイル分布</h2>
                {(data.styleDistribution ?? []).map((r) => (
                  <div key={r.style} className="flex justify-between border-b border-gray-800 py-1 pr-2 text-sm">
                    <span className="text-gray-300">{r.style}</span>
                    <span className="min-w-[3.5rem] pr-2 text-right tabular-nums">{r.count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
              <h2 className="mb-2 text-sm font-medium text-gray-300">人気曲（TOP100）</h2>
              <div className="max-h-[360px] overflow-auto pr-2">
                {(data.popularTracks ?? []).map((r) => (
                  <div key={`${r.videoId}-${r.artist}-${r.title}`} className="flex justify-between border-b border-gray-800 py-1 pr-2 text-sm">
                    <span className="truncate pr-4 text-gray-300">{r.artist} - {r.title}</span>
                    <span className="min-w-[3.5rem] pr-2 text-right tabular-nums">{r.count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                走査件数: {(data.scanned ?? 0).toLocaleString()}
                {data.truncated ? '（上限に達したため一部のみ集計）' : ''}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

