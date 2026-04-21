'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  id: string;
  seed_song_id: string | null;
  seed_video_id: string;
  seed_label: string;
  recommended_artist: string;
  recommended_title: string;
  reason: string;
  youtube_search_query: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  feedback?: { good: number; bad: number; commentCount: number };
};

export default function AdminNextSongRecommendationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/next-song-recommendations?limit=300', { credentials: 'include' });
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

  const onDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/admin/next-song-recommendations?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          alert(data.error ?? '削除に失敗しました。');
          return;
        }
        setRows((prev) => prev.filter((r) => r.id !== id));
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">おすすめ曲ストック管理</h1>
      <p className="mt-2 text-sm text-gray-400">
        当該曲（seed）ごとに AI が保存したおすすめ曲（最大9件）と理由、フィードバック件数を確認・削除できます。
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
        >
          再読み込み
        </button>
      </div>
      {error && (
        <p className="mt-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
      )}
      {loading ? (
        <p className="mt-6 text-sm text-gray-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">データがありません。</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
            <thead className="bg-gray-900/80">
              <tr>
                <th className="px-3 py-2 text-gray-400">日時</th>
                <th className="px-3 py-2 text-gray-400">当該曲（seed）</th>
                <th className="px-3 py-2 text-gray-400">おすすめ曲</th>
                <th className="px-3 py-2 text-gray-400">おすすめ解説</th>
                <th className="px-3 py-2 text-gray-400">検索クエリ</th>
                <th className="px-3 py-2 text-gray-400">評価</th>
                <th className="px-3 py-2 text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-gray-950/40 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-400">{r.created_at}</td>
                  <td className="px-3 py-2 text-xs text-gray-200">
                    <div>{r.seed_label}</div>
                    <div className="mt-1 font-mono text-[10px] text-blue-300">{r.seed_video_id}</div>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-100">
                    {r.order_index}. {r.recommended_artist}「{r.recommended_title}」
                  </td>
                  <td className="max-w-[420px] whitespace-pre-wrap px-3 py-2 text-xs text-gray-200">{r.reason}</td>
                  <td className="px-3 py-2 text-xs text-gray-300">{r.youtube_search_query}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-300">
                    👍 {r.feedback?.good ?? 0} / 👎 {r.feedback?.bad ?? 0} / 💬 {r.feedback?.commentCount ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={deletingId === r.id}
                      className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-1 text-xs font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                      onClick={() => void onDelete(r.id)}
                    >
                      {deletingId === r.id ? '削除中…' : '削除（DBから外す）'}
                    </button>
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

