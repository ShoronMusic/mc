'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  mission_id: string;
  completed_at: string;
  theme_id: string;
  room_id: string | null;
  room_title: string | null;
  owner: string | null;
  participants: string[];
  songs: Array<{ slot_index: number; label: string; selector: string | null; ai_comment: string | null }>;
};

type ApiResponse = { error?: string; days?: number; rows?: Row[] };

export default function AdminThemePlaylistCompletedPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/theme-playlist-completed?days=${days}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data.error || '読み込みに失敗しました。');
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">お題実施一覧（完了分）</h1>
          <div className="flex items-center gap-2 text-sm">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded border border-gray-600 bg-gray-800 px-2 py-1"
            >
              <option value={7}>過去7日</option>
              <option value={30}>過去30日</option>
              <option value={60}>過去60日</option>
              <option value={120}>過去120日</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded bg-gray-700 px-3 py-1 hover:bg-gray-600"
            >
              再読込
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-amber-200">{error}</p>
        ) : null}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500">該当データがありません。</p>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <section key={r.mission_id} className="rounded border border-gray-700 bg-gray-900/40 p-3">
                <div className="mb-2 grid gap-1 text-sm sm:grid-cols-2">
                  <p>
                    <span className="text-gray-400">日時:</span>{' '}
                    {new Date(r.completed_at).toLocaleString('ja-JP')}
                  </p>
                  <p>
                    <span className="text-gray-400">お題:</span> {r.theme_id}
                  </p>
                  <p>
                    <span className="text-gray-400">部屋名:</span> {r.room_title || '—'}
                    {r.room_id ? <span className="ml-1 text-gray-500">({r.room_id})</span> : null}
                  </p>
                  <p>
                    <span className="text-gray-400">オーナー:</span> {r.owner || '—'}
                  </p>
                </div>
                <p className="mb-2 text-sm">
                  <span className="text-gray-400">参加者一覧:</span>{' '}
                  {r.participants.length ? r.participants.join(' / ') : '—'}
                </p>
                <div className="overflow-x-auto rounded border border-gray-800">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b border-gray-700 bg-gray-800/70">
                      <tr>
                        <th className="px-2 py-1.5">#</th>
                        <th className="px-2 py-1.5">曲</th>
                        <th className="px-2 py-1.5">選曲者</th>
                        <th className="px-2 py-1.5">AI講評</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.songs.map((s) => (
                        <tr key={`${r.mission_id}-${s.slot_index}`} className="border-b border-gray-800/70">
                          <td className="px-2 py-1.5">{s.slot_index}</td>
                          <td className="px-2 py-1.5">{s.label}</td>
                          <td className="px-2 py-1.5">{s.selector || '—'}</td>
                          <td className="px-2 py-1.5 whitespace-pre-wrap text-gray-200">
                            {s.ai_comment || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
