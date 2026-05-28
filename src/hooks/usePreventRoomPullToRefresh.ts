'use client';

import { useEffect } from 'react';
import { isMobileUserAgent, isStandaloneDisplayMode } from '@/lib/pwa-client';

const HTML_CLASS = 'mc-prevent-pull-refresh';

/**
 * 部屋視聴中: スマホ/PWA でのプルリフレッシュ・バウンスによるページ全体の再読み込みを抑止。
 * 内側の overflow スクロール（チャット等）は維持する。
 */
export function usePreventRoomPullToRefresh(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;
    if (!isMobileUserAgent() && !isStandaloneDisplayMode()) return;

    document.documentElement.classList.add(HTML_CLASS);
    return () => {
      document.documentElement.classList.remove(HTML_CLASS);
    };
  }, [enabled]);
}
