'use client';

/**
 * 部屋中央エリア:
 * - モバイル縦: 上プレイヤー固定相当、下はチャット＋発言欄の一体スクロール。
 * - モバイル横: 左チャット / 右プレイヤー（発言欄は親の下部）。
 * - PC: ResizableSection。視聴履歴はモーダルまたは右下パネル。
 *
 * モバイル/PC で同一 {rightTop} を同時マウントしない（YouTube 二重化防止）— useIsLgViewport で排他レンダー。
 * モバイル縦横は CSS のみでレイアウト切替（向き変更でプレイヤーを再マウントしない）。
 */

import { useCallback, type ReactNode } from 'react';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { useIsMobileLandscapeViewport } from '@/hooks/useMobileLandscapeViewport';
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
  /**
   * モバイル縦向きのみ: プレイヤー下の一体スクロール内に置く発言欄など。
   * PC・横向きでは親側で下部固定表示する。
   */
  mobileBelowChat?: ReactNode;
}

export default function RoomMainLayout({
  left,
  rightTop,
  rightBottom,
  desktopSwapColumns = false,
  playbackHistoryModalOpen = false,
  onPlaybackHistoryModalClose,
  mobileBelowChat,
}: RoomMainLayoutProps) {
  const isLg = useIsLgViewport();
  const isMobileLandscape = useIsMobileLandscapeViewport();
  const showHistoryInline = isLg && !playbackHistoryModalOpen;
  const showHistoryModal = playbackHistoryModalOpen;
  const unifyBelowPlayerScroll = !isLg && !isMobileLandscape;

  const closeHistoryModal = useCallback(() => {
    onPlaybackHistoryModalClose?.();
  }, [onPlaybackHistoryModalClose]);

  const historyModal = showHistoryModal ? (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/65 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-playback-history-modal-title"
    >
      <div
        className="flex max-h-[min(92dvh,calc(100vh-1rem))] w-full min-h-0 flex-col rounded-t-2xl border border-gray-600 border-b-0 bg-gray-900 shadow-xl sm:max-h-[min(88vh,900px)] sm:max-w-4xl sm:rounded-2xl sm:border-b lg:max-w-5xl"
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
          <div className="flex h-full min-h-[50dvh] flex-col overflow-hidden sm:min-h-[min(60vh,520px)] lg:min-h-[min(70vh,640px)]">
            {rightBottom}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const historyInlinePlaceholder = (
    <div className="flex h-full min-h-[3rem] flex-col items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900/50 px-2 text-center text-xs text-gray-500">
      <p>視聴履歴を拡大表示中</p>
      <button
        type="button"
        onClick={closeHistoryModal}
        className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-gray-300 hover:bg-gray-700"
      >
        閉じる
      </button>
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {isLg ? (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ResizableSection
            left={left}
            rightTop={rightTop}
            rightBottom={showHistoryInline ? rightBottom : historyInlinePlaceholder}
            splitOnLeft={desktopSwapColumns}
          />
        </div>
      ) : (
        <div className="mc-room-mobile-shell">
          <div className="mc-room-mobile-grid">
            <div className="mc-room-mobile-player">{rightTop}</div>
            <div
              className={
                unifyBelowPlayerScroll
                  ? 'mc-room-mobile-below mc-room-mobile-below--unified mc-room-scroll-pane'
                  : 'mc-room-mobile-below'
              }
            >
              <div className="mc-room-mobile-chat">{left}</div>
              {unifyBelowPlayerScroll && mobileBelowChat ? (
                <div className="mc-room-mobile-composer mt-2 space-y-2 pb-1">{mobileBelowChat}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {historyModal}
    </div>
  );
}
