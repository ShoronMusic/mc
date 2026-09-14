'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { GenreBestRegisterModal } from '@/components/admin/GenreBestRegisterModal';
import { GenreBestRegisteredLabelLinks } from '@/components/admin/GenreBestRegisteredLabels';
import type { GenreBestSongLabel } from '@/lib/catalog-genre-best';

export type GenreBestArtistSongRow = {
  id: string;
  song_title: string | null;
  display_title: string | null;
  style: string | null;
  play_count: number | null;
  original_release_date: string | null;
  spotify_images: string | null;
  video_id: string | null;
};

type Props = {
  songs: GenreBestArtistSongRow[];
};

export function GenreBestArtistSongList({ songs }: Props) {
  const [labelsBySong, setLabelsBySong] = useState<Record<string, GenreBestSongLabel[]>>({});
  const [modalSongId, setModalSongId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const songIdsKey = songs.map((s) => s.id).join(',');

  const loadLabels = useCallback(async () => {
    const ids = songs.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) {
      setLabelsBySong({});
      return;
    }
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/genre-best/for-songs?ids=${encodeURIComponent(ids.join(','))}`,
        { credentials: 'include' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          setLabelsBySong({});
          setLoadError(typeof data.error === 'string' ? data.error : null);
          return;
        }
        setLoadError(typeof data.error === 'string' ? data.error : 'ラベル取得に失敗');
        return;
      }
      setLabelsBySong(
        data.bySongId && typeof data.bySongId === 'object'
          ? (data.bySongId as Record<string, GenreBestSongLabel[]>)
          : {},
      );
    } catch {
      setLoadError('ラベル取得に失敗');
    }
  }, [songs]);

  useEffect(() => {
    void loadLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songIdsKey]);

  const modalSong = songs.find((s) => s.id === modalSongId) ?? null;
  const modalTitle = modalSong
    ? (modalSong.song_title ?? modalSong.display_title ?? '—').trim()
    : undefined;

  if (songs.length === 0) {
    return <p className="mt-3 text-gray-500">このアーティストの曲はまだありません。</p>;
  }

  return (
    <>
      {loadError ? <p className="mt-2 text-xs text-amber-700/90">{loadError}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs text-gray-200">
          <thead className="border-b border-gray-700 text-gray-500">
            <tr>
              <th className="py-2 pr-3 text-left font-medium">カバー</th>
              <th className="py-2 pr-3 text-left font-medium">公開年</th>
              <th className="py-2 pr-3 text-left font-medium">タイトル</th>
              <th className="py-2 pr-3 text-left font-medium">スタイル</th>
              <th className="py-2 pr-3 text-right font-medium">再生</th>
              <th className="py-2 pl-2 text-left font-medium">詳細</th>
              <th className="py-2 pl-2 text-left font-medium">Genre BEST</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => {
              const year =
                s.original_release_date && s.original_release_date.length >= 4
                  ? s.original_release_date.slice(0, 4)
                  : '—';
              const title = (s.song_title ?? s.display_title ?? '—').trim();
              const labels = labelsBySong[s.id] ?? [];
              return (
                <tr key={s.id} className="border-t border-gray-800/90">
                  <td className="py-2 pr-3 align-top">
                    <SongCoverThumb
                      spotifyImages={s.spotify_images}
                      videoId={s.video_id}
                      alt=""
                      className="h-10 w-10"
                    />
                  </td>
                  <td className="py-2 pr-3 align-top text-gray-400">{year}</td>
                  <td className="py-2 pr-3 align-top">{title}</td>
                  <td className="py-2 pr-3 align-top text-gray-400">{s.style ?? '—'}</td>
                  <td className="py-2 pr-3 align-top text-right tabular-nums text-gray-400">
                    {s.play_count ?? 0}
                  </td>
                  <td className="py-2 pl-2 align-top">
                    <Link href={`/admin/songs/${s.id}`} className="text-amber-200/90 hover:underline">
                      DB
                    </Link>
                  </td>
                  <td className="py-2 pl-2 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModalSongId(s.id)}
                        className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-600"
                      >
                        Genre BEST
                      </button>
                      {labels.length > 0 ? (
                        <GenreBestRegisteredLabelLinks labels={labels} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <GenreBestRegisterModal
        open={!!modalSongId}
        songId={modalSongId}
        songLabel={modalTitle}
        onClose={() => setModalSongId(null)}
        onRegistered={(pl) => {
          if (!modalSongId) return;
          setLabelsBySong((prev) => {
            const cur = prev[modalSongId] ?? [];
            if (cur.some((x) => x.slug === pl.slug)) return prev;
            return {
              ...prev,
              [modalSongId]: [...cur, pl].sort((a, b) =>
                a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }),
              ),
            };
          });
        }}
      />
    </>
  );
}
