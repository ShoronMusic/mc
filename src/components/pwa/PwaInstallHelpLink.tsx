'use client';

import { useEffect, useState } from 'react';
import { isMobileUserAgent, isStandaloneDisplayMode } from '@/lib/pwa-client';

/** 下部バナーが出ないとき用。トップなどから案内バナーを再表示するリンク */
export function PwaInstallHelpLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isMobileUserAgent() && !isStandaloneDisplayMode());
  }, []);

  if (!show) return null;

  return (
    <p className="mt-3 text-center text-xs text-gray-400">
      <a
        href="/?pwa_install=1"
        className="text-sky-300 underline decoration-dotted underline-offset-2 hover:text-sky-100"
      >
        ホーム画面に追加（アプリとして使う）
      </a>
    </p>
  );
}
