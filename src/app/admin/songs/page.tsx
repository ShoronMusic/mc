'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';

type SongRow = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number | null;
};

export default function AdminSongsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setItems([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/songs-search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || '検索に失敗しました。');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErrorMsg('検索に失敗しました。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 初期表示では何もしない
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col bg-gray-950 p-4 text-gray-100">
      <AdminMenuBar />
      <div className="mb-4">
        <h1 className="text-xl font-semibold">管理者: 曲ダッシュボード（検索）</h1>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: Culture Club - Karma Chameleon / artist / title"
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          検索
        </button>
      </form>

      {errorMsg && (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">検索中...</p>}

      {!loading && items.length === 0 && query.trim() && !errorMsg && (
        <p className="text-sm text-gray-400">一致する曲がありませんでした。</p>
      )}

      {items.length > 0 && (
        <div className="mt-2 overflow-auto rounded border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">曲名（display_title）</th>
                <th className="px-3 py-2 text-left">メインアーティスト</th>
                <th className="px-3 py-2 text-left">曲タイトル</th>
                <th className="px-3 py-2 text-right">play_count</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-gray-800 hover:bg-gray-800/70"
                  onClick={() => router.push(`/admin/songs/${row.id}`)}
                >
                  <td className="px-3 py-2">
                    {row.display_title || '(no display_title)'}
                  </td>
                  <td className="px-3 py-2">{row.main_artist || ''}</td>
                  <td className="px-3 py-2">{row.song_title || ''}</td>
                  <td className="px-3 py-2 text-right">
                    {row.play_count ?? 0}
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

