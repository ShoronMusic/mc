'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  id: string;
  recorded_at: string;
  user_id: string | null;
  room_id: string | null;
  video_id: string;
  watch_url: string;
  artist_label: string;
  song_label: string;
  source: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

export default function AdminAiCommentaryUnavailablePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/ai-commentary-unavailable?limit=300', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; rows?: Row[] };
      if (!res.ok) {
        setRows([]);
        setError(data.error ?? '読み込みに失敗しました。');
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setRows([]);
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setResolved = useCallback(
    async (id: string, resolved: boolean) => {
      setPatchingId(id);
      try {
        const res = await fetch('/api/admin/ai-commentary-unavailable', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, resolved }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; row?: { resolved: boolean; resolved_at: string | null } };
        if (!res.ok) {
          alert(data.error ?? '更新に失敗しました。');
          return;
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  resolved: data.row?.resolved ?? resolved,
                  resolved_at: data.row?.resolved_at ?? (resolved ? new Date().toISOString() : null),
                }
              : r,
          ),
        );
      } finally {
        setPatchingId(null);
      }
    },
    [],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="mb-2 text-xl font-semibold text-white">AI 曲解説不可リスト</h1>
      <p className="mb-6 max-w-3xl text-sm text-gray-400">
        参照データにリリース年・収録出自が揃わず、曲紹介のみとなった選曲を記録します。対応済みは運営メモ用のフラグです（曲解説の再生成は自動では行いません）。
      </p>
      {error && (
        <p className="mb-4 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100/95">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">データがありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/80">
              <tr>
                <th className="px-3 py-2">記録日時</th>
                <th className="px-3 py-2">アーティスト — タイトル</th>
                <th className="px-3 py-2">URL</th>
                <th className="px-3 py-2">由来</th>
                <th className="px-3 py-2">部屋 / ユーザー</th>
                <th className="px-3 py-2">対応済み</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-gray-800/80 align-top ${r.resolved ? 'bg-emerald-950/15' : 'bg-gray-950/40'}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400">
                    {r.recorded_at}
                    {r.resolved_at ? (
                      <div className="mt-1 text-[10px] text-emerald-400/90">対応: {r.resolved_at}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-100">
                    <span className="font-medium">{r.artist_label}</span>
                    <span className="text-gray-500"> — </span>
                    <span>{r.song_label}</span>
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <a
                      href={r.watch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-xs text-blue-300 hover:underline"
                    >
                      {r.watch_url}
                    </a>
                    <div className="mt-1 font-mono text-[10px] text-gray-500">{r.video_id}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400">{r.source}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    <div>room: {r.room_id ?? '—'}</div>
                    <div className="mt-1 font-mono text-[10px] break-all">user: {r.user_id ?? '—'}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={patchingId === r.id || r.resolved}
                        className="rounded border border-emerald-700/70 bg-emerald-950/40 px-2 py-1 text-xs font-medium text-emerald-100/95 hover:bg-emerald-900/45 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => void setResolved(r.id, true)}
                      >
                        対応済み ON
                      </button>
                      <button
                        type="button"
                        disabled={patchingId === r.id || !r.resolved}
                        className="rounded border border-gray-600 bg-gray-900/60 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => void setResolved(r.id, false)}
                      >
                        対応済み OFF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
