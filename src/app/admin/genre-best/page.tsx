'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import {
  buildGenreBestTabGroups,
  filterGenreBestByTab,
  type GenreBestListItem,
  type GenreBestTabKey,
} from '@/lib/catalog-genre-best';

export default function AdminGenreBestPage() {
  const [items, setItems] = useState<GenreBestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<GenreBestTabKey>('genre');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/genre-best', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '読み込みに失敗しました。');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError('読み込みに失敗しました。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tabGroups = useMemo(() => buildGenreBestTabGroups(items), [items]);

  useEffect(() => {
    if (tabGroups.length === 0) return;
    if (!tabGroups.some((g) => g.key === tab)) {
      setTab(tabGroups[0].key);
    }
  }, [tabGroups, tab]);

  const visible = useMemo(() => filterGenreBestByTab(items, tab), [items, tab]);

  const runImport = async (apply: boolean) => {
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/genre-best/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : data.message || '取込に失敗しました。');
        return;
      }
      setImportMsg(typeof data.message === 'string' ? data.message : '完了');
      if (apply) await load();
    } catch {
      setError('取込に失敗しました。');
    } finally {
      setImporting(false);
    }
  };

  const createOne = async () => {
    const t = newTitle.trim();
    if (!t) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/genre-best', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, description: 'Genre Best' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '作成に失敗しました。');
        return;
      }
      const slug = data?.item?.slug;
      if (typeof slug === 'string') {
        window.location.href = `/admin/genre-best/${encodeURIComponent(slug)}`;
        return;
      }
      setNewTitle('');
      await load();
    } catch {
      setError('作成に失敗しました。');
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-4xl">
        <AdminMenuBar />
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">Genre BEST 一覧</h1>
          <p className="text-sm text-gray-400 tabular-nums">{items.length} playlists</p>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          WP の Playlists CPT 相当。正本は Supabase（
          <code className="text-xs text-gray-500">catalog_playlists</code>
          ）。Style 未設定が Genre タブです。
        </p>

        <section className="mb-4 rounded border border-gray-700 bg-gray-900/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-100">WP から取込</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={() => void runImport(false)}
              className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 disabled:opacity-50"
            >
              {importing ? '実行中…' : 'dry-run'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => void runImport(true)}
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
            >
              {importing ? '取込中…' : 'WP から取込（apply）'}
            </button>
          </div>
          {importMsg ? <p className="mt-2 text-xs text-gray-400">{importMsg}</p> : null}
        </section>

        <section className="mb-4 rounded border border-gray-700 bg-gray-900/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-100">新規 Genre BEST</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="min-w-[12rem] flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
              placeholder="例: Disco"
            />
            <button
              type="button"
              disabled={creating || !newTitle.trim()}
              onClick={() => void createOne()}
              className="rounded bg-violet-700 px-4 py-2 text-sm font-medium hover:bg-violet-600 disabled:opacity-50"
            >
              {creating ? '作成中…' : '作成'}
            </button>
          </div>
        </section>

        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中…</p>
        ) : (
          <>
            <div
              className="mb-2 flex flex-wrap gap-1 border-b border-gray-800 pb-2"
              role="tablist"
              aria-label="Genre BEST タブ"
            >
              {tabGroups.map((g) => {
                const active = tab === g.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(g.key)}
                    className={`rounded px-2.5 py-1 text-xs sm:text-sm ${
                      active
                        ? 'bg-emerald-900/40 font-medium text-emerald-200 ring-1 ring-emerald-700/60'
                        : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            <p className="mb-3 text-xs text-gray-500 tabular-nums">{visible.length} playlists</p>

            <ul className="space-y-2">
              {visible.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/genre-best/${encodeURIComponent(item.slug)}`}
                    className="flex items-center gap-3 rounded border border-gray-800 bg-gray-900/40 px-3 py-2 hover:border-gray-600 hover:bg-gray-900/70"
                  >
                    {item.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.coverImageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gray-800 text-gray-500"
                        aria-hidden
                      >
                        ♪
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sky-300">{item.title}</p>
                      {item.styles.length > 0 ? (
                        <p className="truncate text-xs text-gray-500">{item.styles.join(', ')}</p>
                      ) : (
                        <p className="text-xs text-emerald-700/80">Genre</p>
                      )}
                    </div>
                    <p className="shrink-0 text-xs text-gray-500 tabular-nums">
                      {item.songCount} songs
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            {visible.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">このタブに該当する Genre BEST はありません。</p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
