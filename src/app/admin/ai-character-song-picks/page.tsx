'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type LogRow = {
  id: string;
  room_id: string | null;
  room_title: string | null;
  picked_video_id: string | null;
  picked_artist_title: string | null;
  picked_youtube_title: string | null;
  pick_query: string | null;
  pick_reason: string | null;
  confirmation_text: string | null;
  input_comment: string | null;
  created_at: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP');
  } catch {
    return iso;
  }
}

export default function AdminAiCharacterSongPicksPage() {
  const [days, setDays] = useState(7);
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState({ calls: 0 });
  const [byRoom, setByRoom] = useState<Record<string, { calls: number }>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (roomId.trim()) params.set('roomId', roomId.trim());
      const res = await fetch(`/api/admin/ai-character-song-picks?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setTotals({ calls: 0 });
        setByRoom({});
        setLogs([]);
        return;
      }
      setTotals(data?.totals ?? { calls: 0 });
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

  const roomEntries = useMemo(
    () => Object.entries(byRoom).sort((a, b) => b[1].calls - a[1].calls),
    [byRoom]
  );

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">AIキャラ選曲ログ</h1>
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
            <section className="mb-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <div className="text-xs text-gray-500">選曲記録数（期間内）</div>
                <div className="text-2xl font-semibold">{totals.calls.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
                <h2 className="mb-2 text-sm font-medium text-gray-300">部屋別</h2>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {roomEntries.map(([k, v]) => (
                        <tr key={k} className="border-t border-gray-800">
                          <td className="max-w-[340px] truncate py-1 text-gray-300" title={k}>
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
              <div className="max-h-[560px] overflow-auto rounded-lg border border-gray-700">
                <table className="w-full min-w-[1200px] text-left text-xs">
                  <thead className="sticky top-0 border-b border-gray-700 bg-gray-800/95">
                    <tr>
                      <th className="px-2 py-1.5">参加日時</th>
                      <th className="px-2 py-1.5">部屋</th>
                      <th className="px-2 py-1.5">選曲（Artist - Title）</th>
                      <th className="px-2 py-1.5">YouTube題名</th>
                      <th className="px-2 py-1.5">選曲日時</th>
                      <th className="px-2 py-1.5">投入コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r.id} className="border-b border-gray-800/80">
                        <td className="whitespace-nowrap px-2 py-1 text-gray-400">
                          {formatTime(r.created_at)}
                        </td>
                        <td className="max-w-[200px] truncate px-2 py-1 text-gray-300" title={r.room_title || r.room_id || ''}>
                          {r.room_title || r.room_id || '—'}
                        </td>
                        <td className="max-w-[280px] truncate px-2 py-1 text-gray-200" title={r.picked_artist_title || ''}>
                          {r.picked_artist_title || '—'}
                        </td>
                        <td className="max-w-[240px] truncate px-2 py-1 text-gray-400" title={r.picked_youtube_title || ''}>
                          {r.picked_youtube_title || '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-gray-400">{formatTime(r.created_at)}</td>
                        <td className="max-w-[360px] truncate px-2 py-1 text-gray-300" title={r.input_comment || ''}>
                          {r.input_comment || '—'}
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
