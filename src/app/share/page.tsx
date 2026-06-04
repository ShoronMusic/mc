'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getLastActiveRoomSegment,
  setPendingShareChatText,
} from '@/lib/share-target-pending';
import { resolveYouTubeWatchUrlFromSharePayload } from '@/lib/youtube-canonical-watch-url';

function ShareTargetRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('共有を受け取っています…');

  useEffect(() => {
    const watchUrl = resolveYouTubeWatchUrlFromSharePayload({
      url: searchParams.get('url'),
      text: searchParams.get('text'),
      title: searchParams.get('title'),
    });

    if (!watchUrl) {
      setMessage('YouTube の動画 URL ではありません。');
      const t = window.setTimeout(() => router.replace('/?share_error=not_youtube'), 1200);
      return () => window.clearTimeout(t);
    }

    setPendingShareChatText(watchUrl);
    const room = getLastActiveRoomSegment();
    if (room) {
      router.replace(`/${room}`);
      return;
    }
    router.replace('/?share_pending=1');
  }, [router, searchParams]);

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
