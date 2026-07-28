'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import { libraryVariantLabel } from '@/lib/library-variant-label';
import {
  IS_MC_PRODUCT,
  libraryChipBtnClass,
  librarySecondaryBtnClass,
  librarySelectSongBtnClass,
  librarySongSubtitleLine,
  libraryTitleCardClass,
  libraryTitleTextClass,
  mypagePreviewShellClass,
  showRoomStyleUi,
} from '@/lib/product-branding';

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
  /** true のとき保存済み AI 曲解説セクションを開いてスクロール */
  focusAiCommentary?: boolean;
  onFocusAiCommentaryHandled?: () => void;
};

const ACTION_GRID_CLASS = 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3';
const ACTION_GRID_PICK_COPY_CLASS = 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2';

export function MyPageMusicPreviewPanel({
  selection,
  onPickSong,
  onAddToMyList,
  hideAddToMyList = false,
  myListAddBusy = false,
  focusAiCommentary = false,
  onFocusAiCommentaryHandled,
}: MyPageMusicPreviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [song, setSong] = useState<LibrarySongDetail | null>(null);
  const [videos, setVideos] = useState<LibrarySongVideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [commentaryError, setCommentaryError] = useState<string | null>(null);
  const [commentaryBase, setCommentaryBase] = useState<string | null>(null);
  const [commentaryFrees, setCommentaryFrees] = useState<string[]>([]);
  const commentarySectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selection?.videoId) {
      setSong(null);
      setVideos([]);
      setSelectedVideoId(null);
      setLoadError(null);
      setCopyState('idle');
      setCommentaryOpen(false);
      setCommentaryBase(null);
      setCommentaryFrees([]);
      setCommentaryError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setCopyState('idle');
    setCommentaryOpen(false);
    setCommentaryBase(null);
    setCommentaryFrees([]);
    setCommentaryError(null);

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

  useEffect(() => {
    if (!selectedVideoId) {
      setCommentaryBase(null);
      setCommentaryFrees([]);
      setCommentaryError(null);
      return;
    }

    let cancelled = false;
    setCommentaryLoading(true);
    setCommentaryError(null);

    void fetch(`/api/library/ai-commentary?videoId=${encodeURIComponent(selectedVideoId)}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          error?: string;
          found?: boolean;
          baseComment?: string | null;
          freeComments?: string[];
        } | null;
        if (cancelled) return;
        if (!r.ok) {
          setCommentaryError(
            typeof data?.error === 'string' ? data.error : 'AI曲解説の取得に失敗しました。',
          );
          setCommentaryBase(null);
          setCommentaryFrees([]);
          return;
        }
        if (!data?.found || !data.baseComment?.trim()) {
          setCommentaryBase(null);
          setCommentaryFrees([]);
          return;
        }
        setCommentaryBase(data.baseComment.trim());
        setCommentaryFrees(
          Array.isArray(data.freeComments)
            ? data.freeComments.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim())
            : [],
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCommentaryError('AI曲解説の取得に失敗しました。');
          setCommentaryBase(null);
          setCommentaryFrees([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCommentaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVideoId]);

  useEffect(() => {
    if (!focusAiCommentary) return;
    setCommentaryOpen(true);
    const t = window.setTimeout(() => {
      commentarySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      onFocusAiCommentaryHandled?.();
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusAiCommentary, onFocusAiCommentaryHandled, selectedVideoId, commentaryBase]);

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
      <div className={mypagePreviewShellClass()}>
        <p className="text-[11px] text-gray-500">
          曲一覧の「再生」を押すと、ライブラリと同じ形式でここにプレビューが表示されます。保存済みの AI
          曲解説がある曲は「解説」から後から読み返せます（追加のクレジット消費なし）。
        </p>
      </div>
    );
  }

  return (
    <div className={mypagePreviewShellClass()}>
      <p className="mb-2 text-[11px] text-gray-500">
        曲一覧で選ぶと、動画バージョン（公式優先）を選べます。
      </p>
      <div className={libraryTitleCardClass()}>
        <p className={libraryTitleTextClass()}>{headerTitle}</p>
        <p className={`mt-1 text-xs ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'}`}>
          {librarySongSubtitleLine(headerArtist, headerStyle === '—' ? null : headerStyle)}
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
                    setCommentaryOpen(false);
                  }}
                  className={libraryChipBtnClass(active)}
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
          className={librarySelectSongBtnClass()}
          onClick={() => {
            if (selectedUrl) onPickSong(selectedUrl);
          }}
        >
          この曲を選曲
        </button>
        <button
          type="button"
          disabled={!selectedUrl}
          className={librarySecondaryBtnClass()}
          onClick={() => void handleCopyUrl()}
        >
          URLをコピー
        </button>
        {!hideAddToMyList && onAddToMyList ? (
          <button
            type="button"
            disabled={!selectedUrl || myListAddBusy}
            className={librarySecondaryBtnClass()}
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
        <p className={`mt-2 text-xs ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-300'}`}>
          {copyState === 'ok' ? 'URLをコピーしました。' : 'URLコピーに失敗しました。'}
        </p>
      ) : null}

      <div
        ref={commentarySectionRef}
        className={`mt-3 rounded border px-2.5 py-2 ${
          IS_MC_PRODUCT ? 'border-sky-200 bg-sky-50/80' : 'border-sky-800/60 bg-sky-950/30'
        }`}
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setCommentaryOpen((v) => !v)}
          aria-expanded={commentaryOpen}
        >
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${
              IS_MC_PRODUCT ? 'text-sky-800' : 'text-sky-200'
            }`}
          >
            <BookOpenIcon className="h-4 w-4 shrink-0" aria-hidden />
            AI曲解説（保存済み）
          </span>
          <span className="text-[11px] text-gray-500">{commentaryOpen ? '閉じる' : '開く'}</span>
        </button>
        <p className="mt-1 text-[10px] text-gray-500">再生成せず表示のみ。クレジットは消費しません。</p>
        {commentaryOpen ? (
          <div className="mt-2 space-y-2">
            {commentaryLoading ? (
              <p className="text-xs text-gray-500">読み込み中…</p>
            ) : commentaryError ? (
              <p className="text-xs text-amber-300">{commentaryError}</p>
            ) : !commentaryBase ? (
              <p className="text-xs text-gray-500">この動画には保存済みの AI 曲解説がありません。</p>
            ) : (
              <>
                <p
                  className={`whitespace-pre-wrap text-xs leading-relaxed ${
                    IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-200'
                  }`}
                >
                  {commentaryBase}
                </p>
                {commentaryFrees.map((body, i) => (
                  <p
                    key={`free-${i}`}
                    className={`whitespace-pre-wrap border-t pt-2 text-xs leading-relaxed ${
                      IS_MC_PRODUCT
                        ? 'border-sky-200/80 text-gray-700'
                        : 'border-sky-900/50 text-gray-300'
                    }`}
                  >
                    {body}
                  </p>
                ))}
              </>
            )}
          </div>
        ) : null}
      </div>

      <dl
        className={`mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs ${
          IS_MC_PRODUCT ? 'text-gray-700' : 'text-gray-300'
        }`}
      >
        {(
          [
            ['メインアーティスト', song?.main_artist ?? selection.artist],
            ['曲タイトル', song?.song_title ?? selection.title],
            ...(showRoomStyleUi()
              ? ([['スタイル', song?.style ?? selection.style]] as const)
              : []),
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
