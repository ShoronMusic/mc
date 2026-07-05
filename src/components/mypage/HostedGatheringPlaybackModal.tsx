'use client';

import type { HostedGatheringPlaybackSummary } from '@/app/api/user/hosted-gathering-playback/route';
import {
  MyPageMusicPreviewPanel,
  type MyPageMusicPreviewSelection,
} from '@/components/mypage/MyPageMusicPreviewPanel';
import {
  MyPageSongHistoryList,
  type MyPageSongHistoryRow,
} from '@/components/mypage/MyPageSongHistoryList';

type HostedGatheringPlaybackModalProps = {
  gathering: HostedGatheringPlaybackSummary;
  songs: MyPageSongHistoryRow[];
  loading: boolean;
  error: string | null;
  musicPreview: MyPageMusicPreviewSelection | null;
  onPlayPreview: (row: MyPageSongHistoryRow) => void;
  onPickSong: (url: string) => void;
  onAddToMyList: (row: MyPageSongHistoryRow) => void;
  onAddToMyListFromPreview: (payload: {
    videoId: string;
    url: string;
    title: string | null;
    artist: string | null;
  }) => void | Promise<unknown>;
  myListAddBusy?: boolean;
  onClose: () => void;
};

function formatRange(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt && !endedAt) return '日時不明';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  if (startedAt && endedAt) return `${fmt(startedAt)} 〜 ${fmt(endedAt)}`;
  if (endedAt) return `終了: ${fmt(endedAt)}`;
  return `開始: ${fmt(startedAt!)}`;
}

export function HostedGatheringPlaybackModal({
  gathering,
  songs,
  loading,
  error,
  musicPreview,
  onPlayPreview,
  onPickSong,
  onAddToMyList,
  onAddToMyListFromPreview,
  myListAddBusy = false,
  onClose,
}: HostedGatheringPlaybackModalProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="主催した会の視聴履歴"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-700 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">主催した会の視聴履歴</h3>
            <p className="mt-1 text-sm text-amber-200">{gathering.gatheringTitle}</p>
            <p className="text-xs text-gray-400">
              部屋 {gathering.roomId}
              {gathering.roomDisplayTitle ? ` · ${gathering.roomDisplayTitle}` : ''}
            </p>
            <p className="text-xs text-gray-500">{formatRange(gathering.startedAt, gathering.endedAt)}</p>
            <p className="text-xs text-gray-500">{songs.length} 曲（終了時に自動保存）</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="text-sm text-amber-200">{error}</p>
          ) : loading ? (
            <p className="text-sm text-gray-500">視聴履歴を読み込み中…</p>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <MyPageSongHistoryList
                  rows={songs}
                  groupByDate
                  activePreviewVideoId={musicPreview?.videoId ?? null}
                  onPlayPreview={onPlayPreview}
                  onPickSong={onPickSong}
                  onAddToMyList={onAddToMyList}
                  emptyMessage="この会の視聴履歴は保存されていません。"
                />
              </div>
              {musicPreview ? (
                <div className="min-w-0 shrink-0 lg:sticky lg:top-0 lg:w-[min(100%,28rem)]">
                  <MyPageMusicPreviewPanel
                    selection={musicPreview}
                    onPickSong={onPickSong}
                    onAddToMyList={onAddToMyListFromPreview}
                    myListAddBusy={myListAddBusy}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
