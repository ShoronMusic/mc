'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  id: string;
  created_at: string;
  rating: number;
  comment: string | null;
  room_id: string | null;
  display_name: string | null;
  is_guest: boolean;
  user_id: string | null;
};

type ApiResponse = {
  error?: string;
  hint?: string;
  rows?: Row[];
  total?: number;
};

function ratingLabel(r: number): string {
  if (r > 0) return `+${r}`;
  return String(r);
}

export default function AdminSiteFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/site-feedback?limit=200', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        setError(data?.error || '読み込みに失敗しました。');
        setHint(data?.hint ?? null);
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch {
      setError('読み込みに失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">サイトご意見</h1>
      <p className="mt-2 text-sm text-gray-400">
        部屋ヘッダーの「ご意見」から送信された評価（-2〜2）と自由コメントの一覧です。
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
        >
          再読み込み
        </button>
        {total > 0 && (
          <span className="self-center text-sm text-gray-500">全 {total} 件（直近 200 件表示）</span>
        )}
      </div>
      {error && (
        <p className="mt-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
          {hint && <span className="mt-1 block text-xs text-red-300/90">{hint}</span>}
        </p>
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
                <th className="whitespace-nowrap px-3 py-2 font-medium text-gray-400">日時 (UTC)</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-gray-400">評価</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-gray-400">表示名</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-gray-400">部屋</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-gray-400">ゲスト</th>
                <th className="max-w-[100px] px-3 py-2 font-medium text-gray-400">user_id</th>
                <th className="min-w-[200px] px-3 py-2 font-medium text-gray-400">コメント</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.map((r) => (
                <tr key={r.id} className="bg-gray-950/40">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-300">{r.created_at}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-amber-200/95">{ratingLabel(r.rating)}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-gray-300" title={r.display_name ?? ''}>
                    {r.display_name ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-400">{r.room_id ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-400">{r.is_guest ? 'はい' : 'いいえ'}</td>
                  <td
                    className="max-w-[100px] truncate px-3 py-2 font-mono text-[11px] text-gray-500"
                    title={r.user_id ?? ''}
                  >
                    {r.user_id ? `${r.user_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="whitespace-pre-wrap px-3 py-2 text-gray-200">{r.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
