'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Summary = { calls: number; okCalls: number; ngCalls: number };

type LogRow = {
  id: string;
  endpoint: string;
  query_text: string | null;
  video_id: string | null;
  response_status: number | null;
  ok: boolean | null;
  room_id: string | null;
  source: string | null;
  created_at: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminYouTubeApiUsagePage() {
  const [days, setDays] = useState(7);
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<Summary>({ calls: 0, okCalls: 0, ngCalls: 0 });
  const [byEndpoint, setByEndpoint] = useState<Record<string, Summary>>({});
  const [bySource, setBySource] = useState<Record<string, Summary>>({});
  const [byRoom, setByRoom] = useState<Record<string, Summary>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (roomId.trim()) params.set('roomId', roomId.trim());
      const res = await fetch(`/api/admin/youtube-api-usage?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setTotals({ calls: 0, okCalls: 0, ngCalls: 0 });
        setByEndpoint({});
        setBySource({});
        setByRoom({});
        setLogs([]);
        return;
      }
      setTotals(data?.totals ?? { calls: 0, okCalls: 0, ngCalls: 0 });
      setByEndpoint(data?.byEndpoint ?? {});
      setBySource(data?.bySource ?? {});
      setByRoom(data?.byRoom ?? {});
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch {
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [days, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  const endpointEntries = useMemo(
    () => Object.entries(byEndpoint).sort((a, b) => b[1].calls - a[1].calls),
    [byEndpoint]
  );
  const sourceEntries = useMemo(
    () => Object.entries(bySource).sort((a, b) => b[1].calls - a[1].calls),
    [bySource]
  );
  const roomEntries = useMemo(
    () => Object.entries(byRoom).sort((a, b) => b[1].calls - a[1].calls),
    [byRoom]
  );
  const characterPickUsage = bySource['api/ai/character-song-pick'] ?? {
    calls: 0,
    okCalls: 0,
    ngCalls: 0,
  };

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">YouTube API 利用ログ</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              期間
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
              >
                <option value={1}>過去1日</option>
                <option value={7}>過去7日</option>
                <option value={30}>過去30日</option>
                <option value={90}>過去90日</option>
              </select>
            </label>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="roomId（任意）"
              className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => load()}
              className="rounded bg-gray-700 px-3 py-1 text-sm hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-amber-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">呼び出し回数（期間内）</div>
                <div className="text-2xl font-semibold">{totals.calls.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">成功</div>
                <div className="text-2xl font-semibold text-emerald-300">
                  {totals.okCalls.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">失敗</div>
                <div className="text-2xl font-semibold text-rose-300">
                  {totals.ngCalls.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border border-cyan-700/70 bg-cyan-950/20 p-4">
                <div className="text-xs text-cyan-200/80">AIキャラ選曲での使用量</div>
                <div className="text-lg font-semibold text-cyan-200">
                  {characterPickUsage.calls.toLocaleString()} 回
                </div>
                <div className="text-xs text-cyan-200/80">
                  成功 {characterPickUsage.okCalls.toLocaleString()} / 失敗{' '}
                  {characterPickUsage.ngCalls.toLocaleString()}
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <h2 className="mb-2 text-sm font-medium text-gray-300">endpoint 別</h2>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-400">
                        <th className="py-1">endpoint</th>
                        <th className="py-1 text-right">calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {endpointEntries.map(([k, v]) => (
                        <tr key={k} className="border-t border-gray-800">
                          <td className="py-1 font-mono text-xs text-gray-300">{k}</td>
                          <td className="py-1 text-right">{v.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <h2 className="mb-2 text-sm font-medium text-gray-300">source 別</h2>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-400">
                        <th className="py-1">source</th>
                        <th className="py-1 text-right">calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceEntries.map(([k, v]) => (
                        <tr key={k} className="border-t border-gray-800">
                          <td className="py-1 font-mono text-xs text-gray-300">{k}</td>
                          <td className="py-1 text-right">{v.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <h2 className="mb-2 text-sm font-medium text-gray-300">room 別</h2>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-400">
                        <th className="py-1">room</th>
                        <th className="py-1 text-right">calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roomEntries.map(([k, v]) => (
                        <tr key={k} className="border-t border-gray-800">
                          <td className="max-w-[180px] truncate py-1 text-gray-300" title={k}>
                            {k}
                          </td>
                          <td className="py-1 text-right">{v.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-gray-300">直近の記録（最大400件）</h2>
              <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="sticky top-0 border-b border-gray-700 bg-gray-800/95">
                    <tr>
                      <th className="px-2 py-1.5">日時</th>
                      <th className="px-2 py-1.5">endpoint</th>
                      <th className="px-2 py-1.5">source</th>
                      <th className="px-2 py-1.5 text-center">ok</th>
                      <th className="px-2 py-1.5 text-right">status</th>
                      <th className="px-2 py-1.5">room</th>
                      <th className="px-2 py-1.5">video</th>
                      <th className="px-2 py-1.5">query</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/80">
                        <td className="whitespace-nowrap px-2 py-1 text-gray-400">
                          {formatTime(r.created_at)}
                        </td>
                        <td className="px-2 py-1 font-mono text-gray-300">{r.endpoint}</td>
                        <td className="max-w-[180px] truncate px-2 py-1 font-mono text-gray-400" title={r.source ?? ''}>
                          {r.source ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {r.ok === true ? 'OK' : r.ok === false ? 'NG' : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">{r.response_status ?? '—'}</td>
                        <td className="max-w-[100px] truncate px-2 py-1 text-gray-500" title={r.room_id ?? ''}>
                          {r.room_id ?? '—'}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-1 text-gray-500" title={r.video_id ?? ''}>
                          {r.video_id ?? '—'}
                        </td>
                        <td className="max-w-[320px] truncate px-2 py-1 text-gray-400" title={r.query_text ?? ''}>
                          {r.query_text ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

