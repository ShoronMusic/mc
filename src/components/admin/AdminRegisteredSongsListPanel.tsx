'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import type { AdminRegisteredSongsSort } from '@/lib/admin-registered-songs-sort';
import type {
  AdminRegisteredSongListItem,
  AdminRegisteredSongsListResponse,
} from '@/lib/admin-registered-songs-list-types';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { AdminRegisteredSongsMonthlyPanel } from '@/components/admin/AdminRegisteredSongsMonthlyPanel';
import { AdminYoutubePlayerWithVolume } from '@/components/admin/AdminYoutubePlayerWithVolume';
import { adminRegisteredSongStyleBarColor } from '@/lib/admin-registered-songs-monthly';
import { PlayIcon } from '@heroicons/react/24/solid';

type Scope = 'all' | 'western' | 'domestic';

function fmtJst(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function toggleSort(current: AdminRegisteredSongsSort, column: 'created' | 'artist' | 'title' | 'release'): AdminRegisteredSongsSort {
  if (column === 'created') return current === 'created_at_desc' ? 'created_at_asc' : 'created_at_desc';
  if (column === 'artist') return current === 'artist_asc' ? 'artist_desc' : 'artist_asc';
  if (column === 'title') return current === 'title_asc' ? 'title_desc' : 'title_asc';
  return current === 'release_desc' ? 'release_asc' : 'release_desc';
}

function sortMark(active: boolean, asc: boolean): string {
  if (!active) return '';
  return asc ? ' ▲' : ' ▼';
}

export function AdminRegisteredSongsListPanel() {
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [sort, setSort] = useState<AdminRegisteredSongsSort>('created_at_desc');
  const [scope, setScope] = useState<Scope>('western');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AdminRegisteredSongListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [playing, setPlaying] = useState<AdminRegisteredSongListItem | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('sort', sort);
      params.set('scope', scope);
      params.set('page', String(page));
      params.set('pageSize', '50');
      if (qApplied) params.set('q', qApplied);
      const res = await fetch(`/api/admin/songs-registered-list?${params.toString()}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as AdminRegisteredSongsListResponse & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || '取得に失敗しました。');
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setPageSize(typeof data.pageSize === 'number' ? data.pageSize : 50);
    } catch {
      setError('取得に失敗しました。');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [sort, scope, page, qApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQApplied(q.trim());
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <AdminMenuBar />
      <main className={`mx-auto max-w-[1600px] px-4 py-6 sm:px-6 ${playing?.music8_video_id ? 'pb-80' : ''}`}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-amber-100">登録曲一覧</h1>
            <p className="mt-1 text-sm text-gray-400">
              曲名から詳細へ。カバーをクリックするとこの画面のプレイヤーで確認できます。
            </p>
          </div>
          <Link
            href="/admin/songs/new"
            className="inline-flex w-fit rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-500"
          >
            洋楽 1 曲登録
          </Link>
        </div>

        <AdminRegisteredSongsMonthlyPanel scope={scope} />

        <form onSubmit={submitSearch} className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="アーティスト / 曲名"
            className="min-w-[16rem] flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-600"
          >
            検索
          </button>
          <div className="flex gap-1 text-xs">
            {(
              [
                ['western', '洋楽'],
                ['all', 'すべて'],
                ['domestic', '邦楽'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScope(id);
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1.5 ${
                  scope === id
                    ? 'bg-violet-900 text-violet-100 ring-1 ring-violet-700'
                    : 'bg-gray-900 text-gray-400 hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </form>

        <p className="mb-2 text-xs text-gray-500">
          {loading ? '読み込み中…' : `${total.toLocaleString('ja-JP')} 件中 ${items.length} 件を表示（${page} / ${totalPages} ページ）`}
        </p>
        {error ? (
          <p className="mb-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded border border-gray-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-900 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="whitespace-nowrap px-2 py-2">カバー</th>
                <th className="px-3 py-2">
                  <button type="button" className="hover:text-amber-200" onClick={() => { setSort(toggleSort(sort, 'title')); setPage(1); }}>
                    曲名{sortMark(sort.startsWith('title_'), sort === 'title_asc')}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button type="button" className="hover:text-amber-200" onClick={() => { setSort(toggleSort(sort, 'artist')); setPage(1); }}>
                    アーティスト{sortMark(sort.startsWith('artist_'), sort === 'artist_asc')}
                  </button>
                </th>
                <th className="px-3 py-2 whitespace-nowrap">
                  <button type="button" className="hover:text-amber-200" onClick={() => { setSort(toggleSort(sort, 'created')); setPage(1); }}>
                    登録日{sortMark(sort.startsWith('created_at_'), sort === 'created_at_asc')}
                  </button>
                </th>
                <th className="px-3 py-2 whitespace-nowrap">
                  <button type="button" className="hover:text-amber-200" onClick={() => { setSort(toggleSort(sort, 'release')); setPage(1); }}>
                    公開日{sortMark(sort.startsWith('release_'), sort === 'release_asc')}
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2">ジャンル</th>
                <th className="px-3 py-2">紹介</th>
                <th className="whitespace-nowrap px-2 py-2">YT</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    該当する曲はありません。
                  </td>
                </tr>
              ) : null}
              {items.map((row) => {
                const title = row.song_title || row.display_title || '(無題)';
                const videoId = row.music8_video_id?.trim() ?? '';
                const isPlaying = playing?.id === row.id;
                return (
                <tr
                  key={row.id}
                  className={`border-t border-gray-800 hover:bg-gray-900/80 ${
                    isPlaying ? 'bg-lime-950/35' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => {
                        if (!videoId) return;
                        setPlaying(row);
                      }}
                      disabled={!videoId}
                      className={`relative block h-10 w-10 min-h-10 min-w-10 shrink-0 overflow-hidden rounded bg-gray-800 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
                        isPlaying ? 'ring-2 ring-lime-400 ring-offset-1 ring-offset-gray-950' : ''
                      }`}
                      title={videoId ? 'この画面でプレビュー再生' : 'YouTube なし'}
                      aria-label={videoId ? `${title} をプレビュー再生` : `${title}（YouTube なし）`}
                    >
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[5px]"
                        style={{ backgroundColor: adminRegisteredSongStyleBarColor(row.style) }}
                        aria-hidden
                      />
                      <SongCoverThumb
                        spotifyImages={row.spotify_images}
                        videoId={row.music8_video_id}
                        alt=""
                        className="pointer-events-none block h-10 w-10 max-h-10 max-w-10 aspect-square rounded-none"
                      />
                      {videoId ? (
                        <span
                          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
                            isPlaying ? 'bg-black/10' : 'bg-black/35'
                          }`}
                        >
                          {isPlaying ? (
                            <span
                              className="absolute h-6 w-6 rounded-full bg-lime-400/50 blur-[2px] animate-pulse"
                              aria-hidden
                            />
                          ) : null}
                          <PlayIcon
                            className={
                              isPlaying
                                ? 'relative h-4 w-4 text-lime-200 drop-shadow-[0_0_8px_rgba(163,230,53,1)]'
                                : 'relative h-4 w-4 text-white drop-shadow'
                            }
                            aria-hidden
                          />
                        </span>
                      ) : null}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/songs/${row.id}`} className="font-medium text-sky-300 hover:underline">
                      {title}
                    </Link>
                    {row.music8_song_id != null ? (
                      <div className="text-[11px] text-gray-500">WP {row.music8_song_id}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-gray-200">{row.main_artist || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-400">{fmtJst(row.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-400">{fmtDate(row.original_release_date)}</td>
                  <td className="max-w-[9rem] px-2 py-2 text-[11px] leading-snug text-gray-400">
                    {(row.genres ?? []).length > 0 ? row.genres.join(', ') : '—'}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2 text-xs text-gray-500">
                    {row.has_intro ? (
                      <span title={row.intro_preview ?? ''}>{row.intro_preview}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {row.music8_video_id ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${row.music8_video_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-300 hover:underline"
                      >
                        開く
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-gray-700 px-3 py-1 text-gray-300 hover:bg-gray-900 disabled:opacity-40"
          >
            前へ
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-gray-700 px-3 py-1 text-gray-300 hover:bg-gray-900 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      </main>
      {playing?.music8_video_id ? (
        <div className="fixed bottom-4 right-4 z-40 w-[25rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-lime-800/80 bg-gray-950 shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-gray-800 px-2.5 py-1.5">
            <p className="min-w-0 truncate text-xs text-gray-200">
              {playing.main_artist ? `${playing.main_artist} — ` : ''}
              {playing.song_title || playing.display_title || '無題'}
            </p>
            <button
              type="button"
              onClick={() => setPlaying(null)}
              className="shrink-0 rounded border border-gray-600 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
            >
              閉じる
            </button>
          </div>
          <div className="p-2">
            <AdminYoutubePlayerWithVolume
              videoId={playing.music8_video_id}
              autoplay
              initialVolume={50}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
