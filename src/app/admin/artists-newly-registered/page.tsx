'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type {
  ArtistsNewlyRegisteredDay,
} from '@/app/api/admin/artists-newly-registered/route';

function fmtJst(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

export default function AdminArtistsNewlyRegisteredPage() {
  const [days, setDays] = useState(14);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayGroups, setDayGroups] = useState<ArtistsNewlyRegisteredDay[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ days: String(days), pending_wp: pendingOnly ? '1' : '0' });
      const res = await fetch(`/api/admin/artists-newly-registered?${q}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : '取得に失敗しました。');
        setDayGroups([]);
        return;
      }
      setDayGroups(Array.isArray(data.days) ? data.days : []);
      setTotal(typeof data.total_items === 'number' ? data.total_items : 0);
    } catch {
      setError('取得に失敗しました。');
      setDayGroups([]);
    } finally {
      setLoading(false);
    }
  }, [days, pendingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold">選曲登録アーティスト（日別）</h1>
        <p className="mt-1 text-sm text-gray-400">
          選曲時に新規 insert された artists（WP / m8 未照会: music8_artist_id なし）。slug で後から JSON import。
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            日数
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 14)}
              className="ml-2 w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            WP 未照会のみ
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded bg-sky-700 px-3 py-1.5 text-sm hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? '読込中…' : '再読込'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <p className="mt-2 text-sm text-gray-500">合計 {total} 件</p>
        <div className="mt-6 space-y-8">
          {dayGroups.map((g) => (
            <section key={g.date}>
              <h2 className="border-b border-gray-800 pb-1 text-lg font-medium">{g.date}</h2>
              <ul className="mt-2 divide-y divide-gray-800">
                {g.items.map((item) => (
                  <li key={item.id} className="py-2 text-sm">
                    <div className="font-medium">{item.name ?? '—'}</div>
                    <div className="text-gray-500">
                      slug: <code className="text-gray-400">{item.music8_artist_slug ?? '—'}</code>
                      {item.name_base && (
                        <>
                          {' '}
                          · base: {item.name_base}
                          {item.the_prefix ? ` · prefix: ${item.the_prefix}` : ''}
                        </>
                      )}
                    </div>
                    <div className="text-gray-600">{fmtJst(item.created_at)}</div>
                    {item.admin_artist_href && (
                      <Link href={item.admin_artist_href} className="text-sky-400 hover:underline">
                        ライブラリ
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
