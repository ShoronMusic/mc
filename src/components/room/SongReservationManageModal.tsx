'use client';

import { useEffect, useRef, useState } from 'react';
import YouTubePlayer, { type YouTubePlayerHandle } from '@/components/player/YouTubePlayer';

type SongReservationManageModalProps = {
  videoId: string;
  onClose: () => void;
  onDelete: () => void;
};

export function SongReservationManageModal({
  videoId,
  onClose,
  onDelete,
}: SongReservationManageModalProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  useEffect(() => {
    if (!previewOpen) return;
    const t = window.setTimeout(() => {
      try {
        playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [previewOpen, videoId]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="song-reservation-manage-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-600 bg-gray-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="song-reservation-manage-title" className="text-lg font-semibold text-gray-100">
          選曲予約
        </h2>
        <p className="mt-2 break-all text-sm text-gray-300">
          <span className="text-gray-500">URL：</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">
            {url}
          </a>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded border border-sky-700 bg-sky-900/50 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-800/60"
          >
            {previewOpen ? 'プレビューを閉じる' : 'プレビュー'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-700/80 bg-red-950/50 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-900/60"
          >
            削除
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        {previewOpen ? (
          <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-gray-700 bg-black">
            <YouTubePlayer ref={playerRef} videoId={videoId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
