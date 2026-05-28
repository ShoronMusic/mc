'use client';

import { useSyncExternalStore } from 'react';

/**
 * スマホ横向き判定。
 * - タブレット/PCは除外（coarse pointer + no hover）
 * - RoomMainLayout のモバイル横向き2カラム切替に使用
 */
const MOBILE_LANDSCAPE_MEDIA =
  '(max-width: 1023px) and (orientation: landscape) and (hover: none) and (pointer: coarse)';

function subscribeMobileLandscape(callback: () => void) {
  const mq = window.matchMedia(MOBILE_LANDSCAPE_MEDIA);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getMobileLandscapeSnapshot(): boolean {
  return window.matchMedia(MOBILE_LANDSCAPE_MEDIA).matches;
}

function getMobileLandscapeServerSnapshot(): boolean {
  return false;
}

export function useIsMobileLandscapeViewport(): boolean {
  return useSyncExternalStore(
    subscribeMobileLandscape,
    getMobileLandscapeSnapshot,
    getMobileLandscapeServerSnapshot,
  );
}

