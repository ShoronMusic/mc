'use client';

import { useEffect, useState } from 'react';
import {
  formatMusic8SongArtistsLine,
  type Music8SongArtistDisplayItem,
} from '@/lib/music8-song-artists-display';

export type { Music8SongArtistDisplayItem };

type UseLibrarySongArtistsResult = {
  artists: Music8SongArtistDisplayItem[] | null;
  loading: boolean;
  artistsLine: string;
};

/** ライブラリ曲詳細：Music8 順の複数アーティストを取得 */
export function useLibrarySongArtists(
  songId: string | null,
  videoId: string | null,
  fallbackMainArtist: string | null,
): UseLibrarySongArtistsResult {
  const [artists, setArtists] = useState<Music8SongArtistDisplayItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = (songId ?? '').trim();
    if (!id) {
      setArtists(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const qs = new URLSearchParams({ songId: id });
    const vid = (videoId ?? '').trim();
    if (vid) qs.set('videoId', vid);

    void (async () => {
      try {
        const res = await fetch(`/api/library/song-artists?${qs.toString()}`, {
          credentials: 'include',
        });
        const json = (await res.json().catch(() => ({}))) as {
          artists?: Music8SongArtistDisplayItem[];
        };
        if (!cancelled) {
          const list = Array.isArray(json.artists) ? json.artists : null;
          setArtists(list);
        }
      } catch {
        if (!cancelled) setArtists(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [songId, videoId]);

  const artistsLine = formatMusic8SongArtistsLine(artists, fallbackMainArtist);

  return { artists, loading, artistsLine };
}

type LibrarySongArtistsDetailProps = {
  artists: Music8SongArtistDisplayItem[] | null;
  loading: boolean;
  fallbackMainArtist: string | null;
  /** サブアーティスト名クリックでライブラリのアーティスト表示を切り替える */
  onSelectArtist?: (artistName: string) => void;
};

/** 曲詳細メタデータ：アーティスト（メイン→サブ、Music8 順） */
export function LibrarySongArtistsDetail({
  artists,
  loading,
  fallbackMainArtist,
  onSelectArtist,
}: LibrarySongArtistsDetailProps) {
  if (loading) {
    return (
      <>
        <dt className="whitespace-nowrap text-gray-500">アーティスト：</dt>
        <dd className="min-w-0 text-gray-500">読み込み中…</dd>
      </>
    );
  }

  const list =
    artists && artists.length > 0
      ? artists
      : (fallbackMainArtist ?? '').trim()
        ? [{ name: (fallbackMainArtist ?? '').trim(), slug: null, role: 'main' as const }]
        : [];

  if (list.length === 0) return null;

  if (list.length === 1) {
    return (
      <>
        <dt className="whitespace-nowrap text-gray-500">メインアーティスト：</dt>
        <dd className="min-w-0 break-words">{list[0]!.name}</dd>
      </>
    );
  }

  return (
    <>
      <dt className="whitespace-nowrap text-gray-500 align-top pt-0.5">アーティスト：</dt>
      <dd className="min-w-0">
        <ul className="space-y-1">
          {list.map((a) => (
            <li key={`${a.role}-${a.name}`} className="break-words">
              {a.role === 'featured' && onSelectArtist ? (
                <button
                  type="button"
                  onClick={() => onSelectArtist(a.name)}
                  className="text-left text-lime-300/90 hover:text-lime-200 hover:underline"
                  title={`${a.name} の曲一覧へ`}
                >
                  {a.name}
                </button>
              ) : (
                <span className="text-gray-200">{a.name}</span>
              )}
              {a.role === 'main' ? (
                <span className="ml-1.5 text-[10px] text-lime-400/90">メイン</span>
              ) : null}
            </li>
          ))}
        </ul>
      </dd>
    </>
  );
}
