'use client';

import { useEffect, useState } from 'react';
import {
  getLastActiveRoomSegment,
  hasPendingShareChatText,
  markShareRoomEnterPending,
} from '@/lib/share-target-pending';
import { resolveSupabaseUserClient } from '@/lib/supabase/resolve-user-client';

/**
 * 共有後にトップへ来たとき: 直近部屋があればセッション待機のうえ部屋へ自動遷移。
 * なければ案内バナーのみ。
 */
export function SharePendingNotice() {
  const [show, setShow] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sharePendingQuery = params.get('share_pending') === '1';
        const hasPending = hasPendingShareChatText();

        if (sharePendingQuery) {
          params.delete('share_pending');
          const q = params.toString();
          const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
          window.history.replaceState(null, '', next);
        }

        if (!sharePendingQuery && !hasPending) return;

        const room = getLastActiveRoomSegment();
        if (room) {
          if (!cancelled) setRedirecting(true);
          await resolveSupabaseUserClient({ maxWaitMs: 6000 });
          if (!cancelled) {
            markShareRoomEnterPending();
            window.location.replace(`/${room}`);
          }
          return;
        }

        if (!cancelled) setShow(true);
      } catch {
        if (!cancelled) setShow(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (redirecting) {
    return (
      <div className="mx-auto mb-4 w-full max-w-lg rounded-lg border border-gray-600 bg-gray-900/80 px-4 py-3 text-sm text-gray-200">
        共有した URL を受け取りました。部屋を開いています…
      </div>
    );
  }

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
