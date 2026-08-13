'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { FeaturedPageRow } from '@/lib/featured-pages';

export default function AdminFeaturedPagesPage() {
  const [items, setItems] = useState<FeaturedPageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Summer Sonic 2026');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/featured-pages', { credentials: 'include' });
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

  const createPage = async () => {
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/featured-pages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, published: false, ai_usage_free: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '作成に失敗しました。');
        return;
      }
      const id = data?.item?.id;
      if (typeof id === 'string') {
        window.location.href = `/admin/featured-pages/${id}`;
        return;
      }
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
        <h1 className="mb-4 text-xl font-semibold">特集ページ</h1>
        <p className="mb-4 text-sm text-gray-400">
          フェス等の特集を作成し、ライブラリのアーティストをスタイル別に載せます。公開すると部屋チャットにボタンが出ます。
        </p>

        <section className="mb-6 rounded border border-gray-700 bg-gray-900/50 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-100">新規特集ページ作成</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-w-[16rem] flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
              placeholder="例: Summer Sonic 2026"
            />
            <button
              type="button"
              disabled={creating || !title.trim()}
              onClick={() => void createPage()}
              className="rounded bg-violet-700 px-4 py-2 text-sm font-medium hover:bg-violet-600 disabled:opacity-50"
            >
              {creating ? '作成中…' : '作成して編集へ'}
            </button>
          </div>
        </section>

        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">特集はまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-700 bg-gray-900/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/featured-pages/${item.id}`}
                    className="font-medium text-violet-200 hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-gray-500">
                    slug: {item.slug}
                    {item.published ? ' · 公開中' : ' · 下書き'}
                    {item.ai_usage_free ? ' · AI無料' : ''}
                  </p>
                </div>
                <Link
                  href={`/admin/featured-pages/${item.id}`}
                  className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800"
                >
                  編集
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
