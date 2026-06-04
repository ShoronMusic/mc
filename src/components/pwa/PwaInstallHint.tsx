'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dismissPwaInstallHint,
  isAndroidDevice,
  isIosDevice,
  isMobileUserAgent,
  isPwaInstallForceShowFromUrl,
  isPwaInstallHintDismissed,
  isStandaloneDisplayMode,
} from '@/lib/pwa-client';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * スマホブラウザ向け「ホーム画面に追加」案内。standalone では非表示。
 */
export default function PwaInstallHint() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isMobileUserAgent()) return;
    if (isStandaloneDisplayMode()) return;
    if (isPwaInstallHintDismissed() && !isPwaInstallForceShowFromUrl()) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!isAndroidDevice()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const close = useCallback(() => {
    dismissPwaInstallHint();
    setVisible(false);
  }, []);

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      /* ignore */
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
      close();
    }
  }, [close, deferredPrompt]);

  if (!visible) return null;

  const ios = isIosDevice();
  const androidInstallable = Boolean(deferredPrompt);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-gray-600 bg-gray-900/95 px-3 py-3 shadow-lg backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      role="region"
      aria-label="アプリのインストール案内"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2">
        <p className="text-sm font-medium text-white">ホーム画面に追加すると便利です</p>
        {ios ? (
          <p className="text-xs leading-relaxed text-gray-400">
            Safari の<strong className="font-normal text-gray-300">共有</strong>
            （□↑）→<strong className="font-normal text-gray-300">ホーム画面に追加</strong>
          </p>
        ) : androidInstallable ? (
          <p className="text-xs text-gray-400">下のボタンからアプリとしてインストールできます。</p>
        ) : (
          <p className="text-xs leading-relaxed text-gray-400">
            ブラウザメニューから<strong className="font-normal text-gray-300">アプリをインストール</strong>
            または<strong className="font-normal text-gray-300">ホーム画面に追加</strong>を選んでください。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {androidInstallable ? (
            <button
              type="button"
              onClick={() => void onInstallClick()}
              disabled={installing}
              className="rounded bg-lime-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-lime-500 disabled:opacity-60"
            >
              {installing ? '処理中…' : 'インストール'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
