'use client';

import { useEffect, useMemo } from 'react';
import {
  type LibraryArtistAutoplaySongInput,
  type LibrarySongListSortKey,
} from '@/lib/library-artist-autoplay';
import {
  librarySelectSongBtnClass,
  librarySortChipBtnClass,
} from '@/lib/product-branding';

type Props = {
  artistName: string;
  songs: Array<LibraryArtistAutoplaySongInput & { displayMeta?: string }>;
  sort: LibrarySongListSortKey;
  startVideoId: string | null;
  onSortChange: (sort: LibrarySongListSortKey) => void;
  onStartVideoIdChange: (videoId: string | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const SORT_OPTIONS: Array<{ key: LibrarySongListSortKey; label: string }> = [
  { key: 'release_new', label: 'NEW' },
  { key: 'release_old', label: 'OLD' },
  { key: 'popularity', label: '人気順' },
  { key: 'title_asc', label: 'A-Z' },
];

export function LibraryArtistAutoplayConfirmModal({
  artistName,
  songs,
  sort,
  startVideoId,
  onSortChange,
  onStartVideoIdChange,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const startIndex = useMemo(
    () =>
      startVideoId ? songs.findIndex((song) => song.videoId === startVideoId) : 0,
    [songs, startVideoId],
  );
  const selectedStartTitle =
    startVideoId && startIndex >= 0 ? songs[startIndex]?.title?.trim() : '';
  const selectedCount = startIndex >= 0 ? songs.length - startIndex : songs.length;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-autoplay-confirm-title"
    >
      <section className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-lime-700/70 bg-[#050a12] shadow-2xl sm:h-[min(76vh,760px)]">
        <header className="shrink-0 border-b border-lime-900/70 px-3 py-3 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="library-autoplay-confirm-title"
                className="truncate text-sm font-semibold text-lime-100"
              >
                全曲選曲をセット
              </h2>
              <p className="mt-1 truncate text-xs text-gray-400">{artistName}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
            >
              戻る
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            並び順とスタート曲を確認してください。「指定なし」は一覧の先頭から再生します。
          </p>
        </header>

        <div className="shrink-0 border-b border-lime-900/60 px-3 py-2 sm:px-4">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="全曲選曲の並び順"
          >
            <span className="mr-1 text-[11px] text-gray-500">並び順</span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onSortChange(option.key)}
                aria-pressed={sort === option.key}
                className={librarySortChipBtnClass(sort === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-gray-300">
              スタート曲
            </legend>
            <label className="mb-1.5 flex cursor-pointer items-center gap-3 rounded border border-lime-800/60 bg-lime-950/20 px-3 py-2.5 hover:border-lime-600">
              <input
                type="radio"
                name="library-autoplay-start"
                checked={startVideoId === null}
                onChange={() => onStartVideoIdChange(null)}
                className="accent-lime-500"
              />
              <span>
                <span className="block text-xs font-semibold text-lime-100">指定なし</span>
                <span className="block text-[10px] text-gray-500">一覧の先頭から</span>
              </span>
            </label>
            <div className="space-y-1.5">
              {songs.map((song, index) => {
                const videoId = song.videoId?.trim() ?? '';
                if (!videoId) return null;
                return (
                  <label
                    key={videoId}
                    className="flex cursor-pointer items-center gap-3 rounded border border-gray-800 bg-gray-950/70 px-3 py-2 hover:border-violet-700/80"
                  >
                    <input
                      type="radio"
                      name="library-autoplay-start"
                      checked={startVideoId === videoId}
                      onChange={() => onStartVideoIdChange(videoId)}
                      className="accent-violet-500"
                    />
                    <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-gray-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-gray-200">
                        {song.title?.trim() || videoId}
                      </span>
                      {song.displayMeta?.trim() || song.artist?.trim() ? (
                        <span className="block truncate text-[10px] text-gray-500">
                          {song.displayMeta?.trim() || song.artist}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer className="shrink-0 border-t border-lime-900/70 px-3 py-3 sm:px-4">
          <p className="mb-2 text-[11px] text-gray-400">
            {selectedStartTitle
              ? `「${selectedStartTitle}」から ${selectedCount}曲`
              : `先頭から ${songs.length}曲`}
            <span className="text-gray-600">（一般ユーザーは最大40曲）</span>
          </p>
          <button
            type="button"
            onClick={onConfirm}
            disabled={songs.length === 0 || startIndex < 0}
            className={librarySelectSongBtnClass('w-full')}
          >
            この内容で選曲セット
          </button>
        </footer>
      </section>
    </div>
  );
}
