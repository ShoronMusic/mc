'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { SpotifyReviewQueueDay } from '@/app/api/admin/spotify-review-queue/route';

function fmtJst(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso;
  }
}

export default function AdminSpotifyReviewQueuePage() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayGroups, setDayGroups] = useState<SpotifyReviewQueueDay[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/spotify-review-queue?days=${days}`, { credentials: 'include' });
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
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold">Spotify 要確認（日別）</h1>
        <p className="mt-1 text-sm text-gray-400">
          選曲時の Spotify 自動照合で確信できなかった曲。spotify_* は未登録。track ID は候補として記録。
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
                  <li key={item.id} className="py-3 text-sm">
                    <div className="font-medium">{item.display_title ?? '—'}</div>
                    <div className="text-amber-200/90">reason: {item.reason}</div>
                    <div className="mt-1 text-gray-400">
                      Spotify 候補: {item.spotify_name ?? '—'} / {item.spotify_artists ?? '—'}
                    </div>
                    <div className="text-gray-500">
                      track:{' '}
                      <code className="text-xs">{item.spotify_track_id ?? '—'}</code>
                      {item.candidate_rank != null ? ` (#${item.candidate_rank})` : ''}
                    </div>
                    <div className="text-gray-600">{fmtJst(item.created_at)}</div>
                    {item.admin_song_href && (
                      <Link href={item.admin_song_href} className="text-sky-400 hover:underline">
                        曲詳細
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
