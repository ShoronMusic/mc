'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import type { GenreBestDetail } from '@/lib/catalog-genre-best';

function formatYm(date: string | null): string {
  if (!date || date.length < 7) return '—';
  return date.slice(0, 7).replace('-', '.');
}

export default function AdminGenreBestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params?.slug === 'string' ? decodeURIComponent(params.slug) : '';
  const [detail, setDetail] = useState<GenreBestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/genre-best/${encodeURIComponent(slug)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '読み込みに失敗しました。');
        setDetail(null);
        return;
      }
      setDetail(data.detail ?? null);
    } catch {
      setError('読み込みに失敗しました。');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeSong = async (songId: string) => {
    if (!slug || !songId) return;
    if (!window.confirm('この Genre BEST から曲を外しますか？')) return;
    setRemovingId(songId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/genre-best/${encodeURIComponent(slug)}/songs`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : '削除に失敗しました。');
        return;
      }
      await load();
    } catch {
      setError('削除に失敗しました。');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-4xl">
        <AdminMenuBar />
        <div className="mb-3">
          <Link href="/admin/genre-best" className="text-sm text-amber-200/90 hover:underline">
            ← Genre BEST 一覧
          </Link>
        </div>

        {loading ? <p className="text-sm text-gray-500">読み込み中…</p> : null}
        {error ? (
          <p className="mb-4 rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        ) : null}

        {detail ? (
          <>
            <header className="mb-6 flex flex-wrap gap-4">
              {detail.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.coverImageUrl}
                  alt=""
                  className="h-28 w-28 rounded border border-gray-800 object-cover"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded border border-gray-800 bg-gray-900 text-3xl text-gray-600">
                  ♪
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold text-white">{detail.title}</h1>
                {detail.showGenreBestSubtitle ? (
                  <p className="mt-1 text-sm text-emerald-400/90">Genre Best</p>
                ) : detail.description ? (
                  <p className="mt-1 text-sm text-gray-400">{detail.description}</p>
                ) : null}
                <p className="mt-2 text-sm text-gray-500 tabular-nums">
                  {detail.songs.length} songs
                </p>
                {detail.styles.length > 0 ? (
                  <p className="mt-1 text-xs text-gray-500">Style: {detail.styles.join(', ')}</p>
                ) : null}
              </div>
            </header>

            <ul className="space-y-2">
              {detail.songs.map((s) => {
                const title = (s.songTitle ?? s.displayTitle ?? '—').trim();
                const line = [s.mainArtist, title].filter(Boolean).join(' - ');
                return (
                  <li
                    key={s.songId}
                    className="flex flex-wrap items-center gap-3 rounded border border-gray-800 bg-gray-900/40 px-3 py-2"
                  >
                    <SongCoverThumb
                      spotifyImages={s.spotifyImages}
                      videoId={s.videoId}
                      alt=""
                      className="h-12 w-12 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-100">{line}</p>
                      <p className="text-xs text-gray-500">{formatYm(s.originalReleaseDate)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/songs/${s.songId}`}
                        className="text-xs text-amber-200/90 hover:underline"
                      >
                        DB
                      </Link>
                      <button
                        type="button"
                        disabled={removingId === s.songId}
                        onClick={() => void removeSong(s.songId)}
                        className="rounded border border-red-900/60 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      >
                        {removingId === s.songId ? '…' : '外す'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {detail.songs.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                登録曲はありません。ライブラリのアーティスト曲一覧から Genre BEST ボタンで追加してください。
              </p>
            ) : null}
          </>
        ) : !loading && !error ? (
          <p className="text-sm text-gray-500">
            見つかりません。
            <button
              type="button"
              className="ml-2 text-sky-400 hover:underline"
              onClick={() => router.push('/admin/genre-best')}
            >
              一覧へ
            </button>
          </p>
        ) : null}
      </div>
    </main>
  );
}
