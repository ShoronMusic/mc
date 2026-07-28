'use client';

import type { ParticipationSummaryRow } from '@/lib/participation-summary';
import {
  MyPageMusicPreviewPanel,
  type MyPageMusicPreviewSelection,
} from '@/components/mypage/MyPageMusicPreviewPanel';
import {
  MyPageSongHistoryList,
  type MyPageSongHistoryRow,
} from '@/components/mypage/MyPageSongHistoryList';

type ParticipationSongHistoryModalProps = {
  slot: ParticipationSummaryRow;
  songs: MyPageSongHistoryRow[];
  loading?: boolean;
  musicPreview: MyPageMusicPreviewSelection | null;
  onPlayPreview: (row: MyPageSongHistoryRow) => void;
  onViewCommentary?: (row: MyPageSongHistoryRow) => void;
  onPickSong: (url: string) => void;
  onAddToMyList: (row: MyPageSongHistoryRow) => void;
  onAddToMyListFromPreview: (payload: {
    videoId: string;
    url: string;
    title: string | null;
    artist: string | null;
  }) => void | Promise<unknown>;
  myListAddBusy?: boolean;
  focusAiCommentary?: boolean;
  onFocusAiCommentaryHandled?: () => void;
  onClose: () => void;
};

export function ParticipationSongHistoryModal({
  slot,
  songs,
  loading = false,
  musicPreview,
  onPlayPreview,
  onViewCommentary,
  onPickSong,
  onAddToMyList,
  onAddToMyListFromPreview,
  myListAddBusy = false,
  focusAiCommentary = false,
  onFocusAiCommentaryHandled,
  onClose,
}: ParticipationSongHistoryModalProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="参加日の選曲リスト"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-700 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">選曲リスト（参加日）</h3>
            <p className="mt-1 text-xs text-amber-200">{slot.slotLabel}</p>
            <p className="text-xs text-gray-400">
              部屋 {slot.room_id || '—'}
              {slot.gathering_title ? ` · ${slot.gathering_title}` : ''}
              {' · '}
              {songs.length} 曲
            </p>
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              {loading ? (
                <p className="text-sm text-gray-500">選曲リストを読み込み中…</p>
              ) : (
                <MyPageSongHistoryList
                  rows={songs}
                  groupByDate
                  activePreviewVideoId={musicPreview?.videoId ?? null}
                  onPlayPreview={onPlayPreview}
                  onViewCommentary={onViewCommentary}
                  onPickSong={onPickSong}
                  onAddToMyList={onAddToMyList}
                  emptyMessage="この参加期間にあなたが選曲した記録はありません。"
                />
              )}
            </div>
            <div className="min-w-0 shrink-0 lg:sticky lg:top-0 lg:w-[min(100%,28rem)]">
              <MyPageMusicPreviewPanel
                selection={musicPreview}
                onPickSong={onPickSong}
                onAddToMyList={onAddToMyListFromPreview}
                myListAddBusy={myListAddBusy}
                focusAiCommentary={focusAiCommentary}
                onFocusAiCommentaryHandled={onFocusAiCommentaryHandled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
