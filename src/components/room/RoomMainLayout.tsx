'use client';

/**
 * ルーム中央エリア:
 * - モバイル: YouTube は常時表示。視聴履歴はモーダル。
 * - PC: ResizableSection（左チャット / 右は上下リサイズ）。
 *
 * 重要: Tailwind の `lg:hidden` と `hidden lg:flex` で同じ {rightTop} を並べると、
 * React は YouTube プレイヤーを 2 インスタンスマウントする。結果、iframe が二重になり
 * www-widgetapi.js の postMessage が誤ったウィンドウに届き「音だけ／映像が止まる」等になる。
 * そのため lg 未満と lg 以上は matchMedia で排他的にレンダーする。
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import ResizableSection from '@/components/room/ResizableSection';

const LG_MEDIA = '(min-width: 1024px)';

function subscribeLg(callback: () => void) {
  const mq = window.matchMedia(LG_MEDIA);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getLgSnapshot(): boolean {
  return window.matchMedia(LG_MEDIA).matches;
}

function getLgServerSnapshot(): boolean {
  return false;
}

function useIsLgViewport(): boolean {
  return useSyncExternalStore(subscribeLg, getLgSnapshot, getLgServerSnapshot);
}

interface RoomMainLayoutProps {
  left: React.ReactNode;
  rightTop: React.ReactNode;
  rightBottom: React.ReactNode;
}

export default function RoomMainLayout({ left, rightTop, rightBottom }: RoomMainLayoutProps) {
  const isLg = useIsLgViewport();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const closeHistoryModal = useCallback(() => setHistoryModalOpen(false), []);

  useEffect(() => {
    if (!historyModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHistoryModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyModalOpen, closeHistoryModal]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {isLg ? (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ResizableSection left={left} rightTop={rightTop} rightBottom={rightBottom} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="grid min-h-0 flex-1 grid-rows-2 gap-2">
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="shrink-0">{rightTop}</div>
              <div className="flex shrink-0 border-t border-gray-800 pt-2">
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-700"
                >
                  視聴履歴を表示
                </button>
              </div>
            </div>
            <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-gray-800 pt-2">
              {left}
            </div>
          </div>

          {historyModalOpen && (
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
