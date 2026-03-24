'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind `lg` と同じ 1024px */
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

/** 1024px 以上か（RoomMainLayout の PC/モバイル切替と同期） */
export function useIsLgViewport(): boolean {
  return useSyncExternalStore(subscribeLg, getLgSnapshot, getLgServerSnapshot);
}
