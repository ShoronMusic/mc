'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Music8PlaylistAutoplayState } from '@/lib/music8-playlist-autoplay';
import { librarySelectSongBtnClass } from '@/lib/product-branding';

type Props = {
  state: Music8PlaylistAutoplayState;
  /** モーダル見出し（ライブラリ曲リスト / 再生リスト曲リスト） */
  heading?: string;
  onCancel: () => void;
  /** 選択した videoId で連続再生をその位置から再開 */
  onConfirm: (videoId: string) => void;
};

/**
 * 連続再生中: キュー内の曲を選んでジャンプ再生する（ライブラリ／再生リスト共通）。
 */
export function PlaylistAutoplaySongPickModal({
  state,
  heading = '曲リスト',
  onCancel,
  onConfirm,
}: Props) {
  const currentVideoId = state.songs[state.index]?.videoId ?? null;
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(currentVideoId);

  useEffect(() => {
    setSelectedVideoId(state.songs[state.index]?.videoId ?? null);
  }, [state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const selectedIndex = useMemo(
    () =>
      selectedVideoId
        ? state.songs.findIndex((song) => song.videoId === selectedVideoId)
        : -1,
    [selectedVideoId, state.songs],
  );
  const selectedSong = selectedIndex >= 0 ? state.songs[selectedIndex] : null;
  const remainingCount = selectedIndex >= 0 ? state.songs.length - selectedIndex : 0;
  const sourceLabel = state.sourceLabel?.trim() || heading;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlist-autoplay-pick-title"
    >
      <section className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-lime-700/70 bg-[#050a12] shadow-2xl sm:h-[min(76vh,760px)]">
        <header className="shrink-0 border-b border-lime-900/70 px-3 py-3 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="playlist-autoplay-pick-title"
                className="truncate text-sm font-semibold text-lime-100"
              >
                {heading}
              </h2>
              <p className="mt-1 truncate text-xs text-gray-400">
                {sourceLabel}「{state.title}」{state.index + 1}/{state.songs.length}曲目
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
            >
              閉じる
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            連続再生中の曲一覧です。前の曲に戻る、または別の曲を選んでそこから再生できます。
          </p>
        </header>

        <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-gray-300">再生する曲</legend>
            <div className="space-y-1.5">
              {state.songs.map((song, index) => {
                const videoId = song.videoId?.trim() ?? '';
                if (!videoId) return null;
                const isCurrent = index === state.index;
                const isSelected = selectedVideoId === videoId;
                return (
                  <label
                    key={`${videoId}-${index}`}
                    className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 ${
                      isCurrent
                        ? 'border-lime-600/80 bg-lime-950/35'
                        : isSelected
                          ? 'border-violet-600/80 bg-violet-950/30'
                          : 'border-gray-800 bg-gray-950/70 hover:border-violet-700/80'
                    }`}
                  >
                    <input
                      type="radio"
                      name="playlist-autoplay-pick"
                      checked={isSelected}
                      onChange={() => setSelectedVideoId(videoId)}
                      className="accent-violet-500"
                    />
                    <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-gray-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-gray-200">
                        {song.title?.trim() || videoId}
                      </span>
                      {song.artist?.trim() ? (
                        <span className="block truncate text-[10px] text-gray-500">
                          {song.artist}
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? (
                      <span className="shrink-0 rounded border border-lime-700/70 bg-lime-950/50 px-1.5 py-0.5 text-[9px] font-semibold text-lime-100">
                        再生中
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer className="shrink-0 border-t border-lime-900/70 px-3 py-3 sm:px-4">
          <p className="mb-2 text-[11px] text-gray-400">
            {selectedSong
              ? `「${[selectedSong.artist, selectedSong.title].filter(Boolean).join(' - ')}」から ${remainingCount}曲`
              : '曲を選択してください'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (!selectedVideoId) return;
              onConfirm(selectedVideoId);
            }}
            disabled={!selectedVideoId || selectedIndex < 0}
            className={librarySelectSongBtnClass('w-full')}
          >
            この曲から再生
          </button>
        </footer>
      </section>
    </div>
  );
}
