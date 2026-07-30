'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  groupAdminNextSongStockRows,
  summarizeAdminNextSongStockRows,
  type AdminNextSongStockRow,
} from '@/lib/admin-next-song-stock';

type TodoFilter = 'all' | 'library' | 'music8';

function CatalogBadge({
  matched,
  matchedLabel,
  missingLabel,
  color,
}: {
  matched: boolean;
  matchedLabel: string;
  missingLabel: string;
  color: 'green' | 'cyan';
}) {
  const matchedClass =
    color === 'green'
      ? 'border-emerald-700/70 bg-emerald-950/60 text-emerald-200'
      : 'border-cyan-700/70 bg-cyan-950/60 text-cyan-200';
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        matched
          ? matchedClass
          : 'border-amber-800/70 bg-amber-950/50 text-amber-200'
      }`}
    >
      {matched ? matchedLabel : missingLabel}
    </span>
  );
}

export default function AdminNextSongRecommendationsPage() {
  const [rows, setRows] = useState<AdminNextSongStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/next-song-recommendations?limit=300', {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: AdminNextSongStockRow[];
      };
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

  const onDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/admin/next-song-recommendations?id=${encodeURIComponent(id)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? '削除に失敗しました。');
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== id));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const summary = useMemo(() => summarizeAdminNextSongStockRows(rows), [rows]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (todoFilter === 'library') return !row.catalog?.inMcDb;
        if (todoFilter === 'music8') return !row.catalog?.inMusic8;
        return true;
      }),
    [rows, todoFilter],
  );
  const seedGroups = useMemo(
    () => groupAdminNextSongStockRows(filteredRows),
    [filteredRows],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-[96rem] px-4 py-8 text-gray-100 sm:px-6">
      <AdminMenuBar />
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        おすすめ曲ストック管理
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        同一の当該曲（seed）をまとめ、ストック日（JST）ごとに表示します。ライブラリ登録・Music8連携の未対応曲をToDo指標として確認できます。
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['seed曲', summary.seedCount, 'text-blue-200'],
          ['ストック行', summary.recommendationCount, 'text-gray-100'],
          ['おすすめ曲（重複除外）', summary.uniqueRecommendationCount, 'text-violet-200'],
          ['ライブラリ登録ToDo', summary.libraryTodoCount, 'text-amber-200'],
          ['Music8連携ToDo', summary.music8TodoCount, 'text-amber-200'],
        ].map(([label, value, valueClass]) => (
          <div key={String(label)} className="rounded border border-gray-800 bg-gray-950/50 px-3 py-2">
            <div className="text-[11px] text-gray-500">{label}</div>
            <div className={`mt-0.5 text-xl font-semibold tabular-nums ${valueClass}`}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
        >
          再読み込み
        </button>
        <span className="ml-1 text-xs text-gray-500">表示:</span>
        {[
          { key: 'all' as const, label: 'すべて' },
          { key: 'library' as const, label: `ライブラリ未登録 (${summary.libraryTodoCount})` },
          { key: 'music8' as const, label: `Music8未連携 (${summary.music8TodoCount})` },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTodoFilter(option.key)}
            aria-pressed={todoFilter === option.key}
            className={`rounded border px-2.5 py-1.5 text-xs ${
              todoFilter === option.key
                ? 'border-violet-500 bg-violet-950/70 text-violet-100'
                : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">
          ライブラリ・Music8との照合を含めて読み込み中…
        </p>
      ) : seedGroups.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">
          {rows.length === 0 ? 'データがありません。' : '条件に該当する曲がありません。'}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {seedGroups.map((group) => (
            <section
              key={group.seedVideoId}
              className="overflow-hidden rounded-lg border border-gray-700 bg-gray-950/30"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 bg-gray-900/90 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-blue-300">
                    当該曲（seed）
                  </div>
                  <h2 className="mt-0.5 text-base font-semibold text-white">
                    {group.seedLabel}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-gray-500">
                    <a
                      href={`https://www.youtube.com/watch?v=${encodeURIComponent(group.seedVideoId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-300 hover:underline"
                    >
                      YouTube: {group.seedVideoId}
                    </a>
                    {group.seedSongId ? <span>song_id: {group.seedSongId}</span> : null}
                  </div>
                </div>
                <span className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs tabular-nums text-gray-300">
                  {group.rowCount}件
                </span>
              </header>

              <div className="divide-y divide-gray-800">
                {group.days.map((day) => (
                  <section key={day.dateJst}>
                    <div className="flex items-center justify-between bg-gray-900/50 px-4 py-2">
                      <h3 className="text-sm font-semibold text-gray-200">{day.dateJst}（JST）</h3>
                      <span className="text-xs tabular-nums text-gray-500">{day.rows.length}件</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-y border-gray-800 bg-black/20 text-[11px] text-gray-500">
                          <tr>
                            <th className="px-3 py-2">おすすめ曲</th>
                            <th className="px-3 py-2">登録・連携状況</th>
                            <th className="px-3 py-2">おすすめ解説</th>
                            <th className="px-3 py-2">検索クエリ</th>
                            <th className="px-3 py-2">評価</th>
                            <th className="px-3 py-2">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/80">
                          {day.rows.map((row) => (
                            <tr key={row.id} className="align-top hover:bg-gray-900/40">
                              <td className="min-w-[220px] px-3 py-2.5">
                                <div className="font-medium text-gray-100">
                                  {row.order_index}. {row.recommended_artist}「{row.recommended_title}」
                                </div>
                                <div className="mt-1 text-[10px] text-gray-600">
                                  {new Date(row.created_at).toLocaleTimeString('ja-JP', {
                                    timeZone: 'Asia/Tokyo',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </div>
                              </td>
                              <td className="min-w-[190px] px-3 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  <CatalogBadge
                                    matched={Boolean(row.catalog?.inMcDb)}
                                    matchedLabel="ライブラリ登録済"
                                    missingLabel="ライブラリ未登録"
                                    color="green"
                                  />
                                  <CatalogBadge
                                    matched={Boolean(row.catalog?.inMusic8)}
                                    matchedLabel="Music8連携済"
                                    missingLabel="Music8未連携"
                                    color="cyan"
                                  />
                                </div>
                                {row.catalog?.songId ? (
                                  <div className="mt-1 break-all font-mono text-[9px] text-gray-600">
                                    song_id: {row.catalog.songId}
                                  </div>
                                ) : null}
                              </td>
                              <td className="max-w-[400px] whitespace-pre-wrap px-3 py-2.5 text-xs leading-relaxed text-gray-300">
                                {row.reason}
                              </td>
                              <td className="max-w-[220px] px-3 py-2.5 text-xs text-gray-400">
                                {row.youtube_search_query}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-400">
                                👍 {row.feedback?.good ?? 0} / 👎 {row.feedback?.bad ?? 0} / 💬{' '}
                                {row.feedback?.commentCount ?? 0}
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  disabled={deletingId === row.id}
                                  className="rounded border border-amber-700/80 bg-amber-950/40 px-2 py-1 text-xs font-medium text-amber-200/95 hover:bg-amber-900/50 disabled:opacity-50"
                                  onClick={() => void onDelete(row.id)}
                                >
                                  {deletingId === row.id ? '削除中…' : '削除'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

