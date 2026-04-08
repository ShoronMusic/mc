'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type Row = {
  id: string;
  created_at: string;
  reporter_user_id: string;
  room_id: string | null;
  message_kind: string;
  video_id: string;
  chat_message_body: string | null;
  reporter_note: string | null;
  snapshot: unknown;
};

type ApiResponse = {
  error?: string;
  hint?: string;
  rows?: Row[];
  total?: number;
};

export default function AdminArtistTitleParseReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/artist-title-parse-reports?limit=200', {
        credentials: 'include',
      });
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

  const downloadAllJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `artist-title-parse-reports-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        曲名表記スナップショット
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        部屋チャットの「表記メタを記録」で保存したレコードです。各行の <code className="text-gray-300">snapshot</code>{' '}
        に oEmbed・snippet・<code className="text-gray-300">resolvedPack</code> などが入ります。
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
        >
          再読み込み
        </button>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={downloadAllJson}
            className="rounded border border-amber-800/80 bg-amber-950/50 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/40"
          >
            表示中を JSON ダウンロード
          </button>
        )}
        {total > 0 && (
          <span className="self-center text-sm text-gray-500">全 {total} 件（最大 200 件表示）</span>
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
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const open = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-gray-500">{r.created_at}</p>
                    <p className="mt-1 text-gray-200">
                      <span className="text-amber-200/90">{r.message_kind}</span>
                      {' · '}
                      <a
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:underline"
                      >
                        {r.video_id}
                      </a>
                      {r.room_id ? (
                        <span className="text-gray-500">
                          {' '}
                          · 部屋 <span className="text-gray-400">{r.room_id}</span>
                        </span>
                      ) : null}
                    </p>
                    {r.reporter_note ? (
                      <p className="mt-1 text-xs text-gray-400">メモ: {r.reporter_note}</p>
                    ) : null}
                    {r.chat_message_body ? (
                      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-gray-500">
                        {r.chat_message_body}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : r.id)}
                    className="shrink-0 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    {open ? 'snapshot を閉じる' : 'snapshot を表示'}
                  </button>
                </div>
                {open ? (
                  <pre className="mt-3 max-h-[70vh] overflow-auto rounded border border-gray-800 bg-black/40 p-2 text-[11px] leading-relaxed text-gray-300">
                    {JSON.stringify(r.snapshot, null, 2)}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
