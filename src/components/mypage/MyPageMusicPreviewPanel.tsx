'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryVariantLabel } from '@/lib/library-variant-label';

export type MyPageMusicPreviewSelection = {
  videoId: string;
  url: string;
  title: string | null;
  artist: string | null;
  style: string | null;
  era: string | null;
};

type LibrarySongDetail = {
  id: string;
  title: string;
  song_title: string | null;
  main_artist: string | null;
  style: string | null;
  genres: string | null;
  vocal: string | null;
  play_count: number | null;
  original_release_date: string | null;
};

type LibrarySongVideoItem = {
  video_id: string;
  variant: string | null;
};

type MyPageMusicPreviewPanelProps = {
  selection: MyPageMusicPreviewSelection | null;
  onPickSong: (url: string) => void;
  onAddToMyList?: (payload: {
    videoId: string;
    url: string;
    title: string | null;
    artist: string | null;
  }) => void | Promise<unknown>;
  hideAddToMyList?: boolean;
  myListAddBusy?: boolean;
};

const ACTION_GRID_CLASS = 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3';
const ACTION_GRID_PICK_COPY_CLASS = 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2';

export function MyPageMusicPreviewPanel({
  selection,
  onPickSong,
  onAddToMyList,
  hideAddToMyList = false,
  myListAddBusy = false,
}: MyPageMusicPreviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [song, setSong] = useState<LibrarySongDetail | null>(null);
  const [videos, setVideos] = useState<LibrarySongVideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  useEffect(() => {
    if (!selection?.videoId) {
      setSong(null);
      setVideos([]);
      setSelectedVideoId(null);
      setLoadError(null);
      setCopyState('idle');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setCopyState('idle');

    void fetch(`/api/library/song-by-video?videoId=${encodeURIComponent(selection.videoId)}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          error?: string;
          song?: LibrarySongDetail | null;
          videos?: LibrarySongVideoItem[];
        } | null;
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(typeof data?.error === 'string' ? data.error : '曲情報の取得に失敗しました。');
          setSong(null);
          setVideos([{ video_id: selection.videoId, variant: null }]);
          setSelectedVideoId(selection.videoId);
          return;
        }
        const vids = Array.isArray(data?.videos) ? data!.videos! : [];
        setSong(data?.song ?? null);
        setVideos(vids.length > 0 ? vids : [{ video_id: selection.videoId, variant: null }]);
        const preferred =
          vids.find((v) => v.video_id === selection.videoId)?.video_id ??
          vids[0]?.video_id ??
          selection.videoId;
        setSelectedVideoId(preferred);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('曲情報の取得に失敗しました。');
          setSong(null);
          setVideos([{ video_id: selection.videoId, variant: null }]);
          setSelectedVideoId(selection.videoId);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selection?.videoId]);

  const headerTitle = useMemo(() => {
    if (song?.song_title?.trim()) return song.song_title.trim();
    if (song?.title?.trim()) return song.title.trim();
    if (selection?.title?.trim()) return selection.title.trim();
    return selection?.videoId ?? '';
  }, [song, selection]);

  const headerArtist = song?.main_artist?.trim() || selection?.artist?.trim() || '—';
  const headerStyle = song?.style?.trim() || selection?.style?.trim() || '—';

  const selectedUrl = selectedVideoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(selectedVideoId)}`
    : selection?.url ?? '';

  const handleCopyUrl = useCallback(async () => {
    if (!selectedUrl) return;
    try {
      await navigator.clipboard.writeText(selectedUrl);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    }
  }, [selectedUrl]);

  if (!selection) {
    return (
      <div className="rounded border border-gray-700/80 bg-gray-900/40 p-3">
        <p className="text-[11px] text-gray-500">
          曲一覧の「再生」を押すと、ライブラリと同じ形式でここにプレビューが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-lime-900/50 bg-gray-900/30 p-3">
      <p className="mb-2 text-[11px] text-gray-400">
        曲一覧で選ぶと、動画バージョン（公式優先）を選べます。
      </p>
      <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
        <p className="text-sm font-medium text-gray-100">{headerTitle}</p>
        <p className="mt-1 text-xs text-gray-400">
          {headerArtist} / {headerStyle}
        </p>
      </div>
      <div className="mb-2">
        <p className="mb-1 text-[11px] text-gray-500">動画バージョン</p>
        {loading ? (
          <p className="text-xs text-gray-500">読み込み中…</p>
        ) : loadError ? (
          <p className="text-xs text-amber-300">{loadError}</p>
        ) : videos.length === 0 ? (
          <p className="text-xs text-gray-500">候補動画がありません。</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {videos.map((v) => {
              const active = v.video_id === selectedVideoId;
              return (
                <button
                  key={v.video_id}
                  type="button"
                  onClick={() => {
                    setSelectedVideoId(v.video_id);
                    setCopyState('idle');
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    active
                      ? 'bg-lime-700 text-white'
                      : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {libraryVariantLabel(v.variant)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selectedVideoId ? (
        <div className="aspect-video overflow-hidden rounded border border-gray-800 bg-black">
          <iframe
            key={selectedVideoId}
            title="My Page library preview"
            src={`https://www.youtube.com/embed/${encodeURIComponent(selectedVideoId)}?autoplay=1&controls=1&modestbranding=1`}
            className="h-full w-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded border border-gray-800 bg-black/50 text-xs text-gray-500">
          動画候補を選んでください
        </div>
      )}
      <div className={hideAddToMyList ? ACTION_GRID_PICK_COPY_CLASS : ACTION_GRID_CLASS}>
        <button
          type="button"
          disabled={!selectedUrl}
          className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
          onClick={() => {
            if (selectedUrl) onPickSong(selectedUrl);
          }}
        >
          この曲を選曲
        </button>
        <button
          type="button"
          disabled={!selectedUrl}
          className="h-11 rounded border border-gray-600 bg-gray-800 px-3 text-sm text-gray-100 hover:bg-gray-700 disabled:opacity-50"
          onClick={() => void handleCopyUrl()}
        >
          URLをコピー
        </button>
        {!hideAddToMyList && onAddToMyList ? (
          <button
            type="button"
            disabled={!selectedUrl || myListAddBusy}
            className="h-11 rounded border border-violet-600/60 bg-violet-900/40 px-3 text-sm font-semibold text-violet-100 hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-50"
            title="マイページのマイリストに追加"
            onClick={() =>
              void onAddToMyList({
                videoId: selectedVideoId ?? selection.videoId,
                url: selectedUrl,
                title: selection.title,
                artist: selection.artist,
              })
            }
          >
            {myListAddBusy ? '追加中…' : 'マイリスト追加'}
          </button>
        ) : null}
      </div>
      {copyState !== 'idle' ? (
        <p className="mt-2 text-xs text-gray-300">
          {copyState === 'ok' ? 'URLをコピーしました。' : 'URLコピーに失敗しました。'}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-gray-300">
        {(
          [
            ['メインアーティスト', song?.main_artist ?? selection.artist],
            ['曲タイトル', song?.song_title ?? selection.title],
            ['スタイル', song?.style ?? selection.style],
            ['ジャンル', song?.genres ?? null],
            [
              '公開日',
              song?.original_release_date ? song.original_release_date.slice(0, 7) : null,
            ],
            ['年代', selection.era],
            ['ボーカル', song?.vocal ?? null],
            ['選曲回数', song?.play_count != null ? String(song.play_count) : null],
          ] as const
        )
          .filter(([, v]) => v != null && String(v).trim() !== '')
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="whitespace-nowrap text-gray-500">{label}：</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
