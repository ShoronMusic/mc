'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { groupGenresByInitial } from '@/lib/admin-song-artist-defaults';
import type { CatalogGenreRow } from '@/lib/catalog-genres';

export default function AdminCatalogGenresPage() {
  const [items, setItems] = useState<CatalogGenreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/admin/catalog-genres', { credentials: 'include' });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        items?: CatalogGenreRow[];
      };
      if (!res.ok) {
        setItems([]);
        setError(data.error ?? '読み込みに失敗しました。');
        setHint(typeof data.hint === 'string' ? data.hint : null);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      setError('読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const needles = q.split(/\s+/).filter(Boolean);
    return items.filter((it) => {
      const hay = [it.name, it.name_ja ?? '', it.slug, it.parent_genre ?? '']
        .join(' ')
        .toLowerCase();
      return needles.every((n) => hay.includes(n));
    });
  }, [items, query]);

  const grouped = useMemo(
    () => groupGenresByInitial(filtered.map((it) => it.name)),
    [filtered],
  );

  const byName = useMemo(() => {
    const m = new Map<string, CatalogGenreRow[]>();
    for (const it of filtered) {
      const arr = m.get(it.name) ?? [];
      arr.push(it);
      m.set(it.name, arr);
    }
    return m;
  }, [filtered]);

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-5xl">
        <AdminMenuBar />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">ジャンル</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-400">
              ライブラリの <code className="rounded bg-gray-800 px-1">catalog_genres</code>（公開{' '}
              <code className="rounded bg-gray-800 px-1">/music/genres</code>
              ）です。Genre BEST（プレイリスト）とは別です。曲への紐づけは曲詳細のジャンル選択から行います。
            </p>
          </div>
          <Link
            href="/admin/genres/new"
            className="rounded bg-violet-700 px-4 py-2 text-sm font-medium hover:bg-violet-600"
          >
            新規登録
          </Link>
        </div>

        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
            {hint ? <span className="mt-1 block text-xs text-amber-200/80">{hint}</span> : null}
          </p>
        ) : null}

        <div className="mb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・日本語名・slug で絞り込み"
            className="w-full max-w-md rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="text-gray-400">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500">
            {items.length === 0 ? 'ジャンルはまだありません。' : '一致するジャンルはありません。'}
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500">
              {filtered.length} 件{query.trim() ? `（全 ${items.length} 件から絞込）` : ''}
            </p>
            <div className="mb-4 flex flex-wrap gap-1">
              {grouped.map((g) => (
                <a
                  key={g.initial}
                  href={`#genre-initial-${g.initial === '#' ? 'other' : g.initial}`}
                  className="min-w-[1.5rem] rounded bg-gray-900 px-1.5 py-0.5 text-center text-[11px] font-medium text-sky-300 hover:bg-gray-800"
                >
                  {g.initial}
                </a>
              ))}
            </div>
            <div className="space-y-6">
              {grouped.map((group) => (
                <section
                  key={group.initial}
                  id={`genre-initial-${group.initial === '#' ? 'other' : group.initial}`}
                  className="scroll-mt-4"
                >
                  <h2 className="mb-2 text-sm font-semibold text-amber-200">{group.initial}</h2>
                  <ul className="divide-y divide-gray-800 rounded border border-gray-800">
                    {group.names.flatMap((name) =>
                      (byName.get(name) ?? []).map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/admin/genres/${item.id}`}
                              className="font-medium text-violet-200 hover:underline"
                            >
                              {item.name}
                            </Link>
                            {item.name_ja ? (
                              <span className="ml-2 text-sm text-gray-400">{item.name_ja}</span>
                            ) : null}
                            <p className="text-xs text-gray-500">
                              slug: {item.slug}
                              {item.parent_genre ? ` · parent: ${item.parent_genre}` : ''}
                              {typeof item.song_count === 'number' ? ` · ${item.song_count} 曲` : ''}
                            </p>
                          </div>
                          <Link
                            href={`/admin/genres/${item.id}`}
                            className="rounded border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800"
                          >
                            編集
                          </Link>
                        </li>
                      )),
                    )}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
