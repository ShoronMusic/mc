'use client';

/**
 * ルーム中央エリア:
 * - モバイル: YouTube は常時表示。視聴履歴はモーダル（開閉は親が UserBar 経由で制御）。
 * - PC: ResizableSection（左チャット / 右は上下リサイズ）。
 *
 * モバイル/PC で同一 {rightTop} を同時マウントしない（YouTube 二重化防止）— useIsLgViewport で排他レンダー。
 */

import { useCallback, useEffect } from 'react';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import ResizableSection from '@/components/room/ResizableSection';

interface RoomMainLayoutProps {
  left: React.ReactNode;
  rightTop: React.ReactNode;
  rightBottom: React.ReactNode;
  /** PCのみ左右カラムを入れ替える（左: rightTop/rightBottom, 右: left） */
  desktopSwapColumns?: boolean;
  /** モバイル: 視聴履歴モーダル表示（UserBar のボタンから親が true にする） */
  playbackHistoryModalOpen?: boolean;
  onPlaybackHistoryModalClose?: () => void;
}

export default function RoomMainLayout({
  left,
  rightTop,
  rightBottom,
  desktopSwapColumns = false,
  playbackHistoryModalOpen = false,
  onPlaybackHistoryModalClose,
}: RoomMainLayoutProps) {
  const isLg = useIsLgViewport();

  const closeHistoryModal = useCallback(() => {
    onPlaybackHistoryModalClose?.();
  }, [onPlaybackHistoryModalClose]);

  useEffect(() => {
    if (!playbackHistoryModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHistoryModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playbackHistoryModalOpen, closeHistoryModal]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {isLg ? (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ResizableSection
            left={left}
            rightTop={rightTop}
            rightBottom={rightBottom}
            splitOnLeft={desktopSwapColumns}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
          {/**
           * 旧 grid-rows-2 は 1fr 1fr で上下が同じ高さになり、プレイヤー（aspect-video）の下に
           * 大きな空きができる。上段を auto、チャットを minmax(0,1fr) で残り領域いっぱいにする。
           */}
          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-1">
            <div className="shrink-0">{rightTop}</div>
            <div className="flex min-h-0 flex-col overflow-hidden border-t border-gray-800 pt-1">
              {left}
            </div>
          </div>

          {playbackHistoryModalOpen && (
            <div
              className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/65 sm:items-center sm:justify-center sm:p-4"
              onClick={(e) => e.target === e.currentTarget && closeHistoryModal()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="room-playback-history-modal-title"
            >
              <div
                className="flex max-h-[min(92dvh,calc(100vh-1rem))] w-full min-h-0 flex-col rounded-t-2xl border border-gray-600 border-b-0 bg-gray-900 shadow-xl sm:max-h-[min(88vh,900px)] sm:rounded-2xl sm:border-b sm:pb-[env(safe-area-inset-bottom)]"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-700 px-3 py-2.5">
                  <h2 id="room-playback-history-modal-title" className="truncate text-sm font-medium text-gray-200">
                    視聴履歴
                  </h2>
                  <button
                    type="button"
                    onClick={closeHistoryModal}
                    className="shrink-0 rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    閉じる
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-1 sm:px-3">
                  <div className="flex h-full min-h-[50dvh] flex-col overflow-hidden sm:min-h-[min(60vh,520px)]">
                    {rightBottom}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
