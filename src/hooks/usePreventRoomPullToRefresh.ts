'use client';

import { useEffect } from 'react';
import { isMobileUserAgent, isStandaloneDisplayMode } from '@/lib/pwa-client';

const STANDALONE_CLASS = 'mc-prevent-pull-refresh';
/** ブラウザのタブ: document を固定しない（アドレスバー下のヘッダーが隠れない） */
const BROWSER_LITE_CLASS = 'mc-prevent-pull-refresh-lite';

/**
 * 部屋視聴中: プルリフレッシュ・バウンスによるページ全体の再読み込みを抑止。
 * - ホーム画面（standalone）: html/body を固定（従来どおり）
 * - スマホブラウザ: overscroll のみ（上端までスクロール可能）
 */
export function usePreventRoomPullToRefresh(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    const standalone = isStandaloneDisplayMode();
    const mobileBrowser = !standalone && isMobileUserAgent();
    if (!standalone && !mobileBrowser) return;

    const cls = standalone ? STANDALONE_CLASS : BROWSER_LITE_CLASS;
    document.documentElement.classList.add(cls);
    return () => {
      document.documentElement.classList.remove(cls);
    };
  }, [enabled]);
}
