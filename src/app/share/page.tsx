'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getLastActiveRoomSegment,
  setPendingShareChatText,
} from '@/lib/share-target-pending';
import { warmSupabaseSessionClient } from '@/lib/supabase/resolve-user-client';
import { resolveYouTubeWatchUrlFromSharePayload } from '@/lib/youtube-canonical-watch-url';

function ShareTargetRedirect() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('共有を受け取っています…');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const watchUrl = resolveYouTubeWatchUrlFromSharePayload({
        url: searchParams.get('url'),
        text: searchParams.get('text'),
        title: searchParams.get('title'),
      });

      if (!watchUrl) {
        if (!cancelled) setMessage('YouTube の動画 URL ではありません。');
        window.setTimeout(() => {
          if (!cancelled) window.location.replace('/?share_error=not_youtube');
        }, 1200);
        return;
      }

      setPendingShareChatText(watchUrl);
      await warmSupabaseSessionClient();

      const room = getLastActiveRoomSegment();
      if (cancelled) return;
      if (room) {
        window.location.replace(`/${room}`);
        return;
      }
      window.location.replace('/?share_pending=1');
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 p-6 text-center">
      <p className="text-sm text-gray-300">{message}</p>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <p className="text-sm text-gray-400">読み込み中…</p>
        </div>
      }
    >
      <ShareTargetRedirect />
    </Suspense>
  );
}
