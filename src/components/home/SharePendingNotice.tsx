'use client';

import { useEffect, useState } from 'react';

/** 共有 URL を保持したままトップに来たときの案内 */
export function SharePendingNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('share_pending') === '1') {
        setShow(true);
        params.delete('share_pending');
        const q = params.toString();
        const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
        window.history.replaceState(null, '', next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  return (
    <div
      className="mx-auto mb-4 w-full max-w-lg rounded-lg border border-sky-600/50 bg-sky-950/40 px-4 py-3 text-sm text-sky-100"
      role="status"
    >
      YouTube から共有した URL を保存しました。部屋を開くと発言欄に入ります（送信はご自身で行ってください）。
    </div>
  );
}
