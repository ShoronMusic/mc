'use client';

import { AblyProvider as AblyProviderBase, ChannelProvider } from 'ably/react';
import Ably from 'ably';
import { useRouter } from 'next/navigation';
import { useMemo, useCallback, useEffect } from 'react';
import { GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from '@/components/auth/JoinChoice';
import RoomWithSync from '@/components/room/RoomWithSync';
import RoomWithoutSync from '@/components/room/RoomWithoutSync';
import { createClient } from '@/lib/supabase/client';

const DEFAULT_DISPLAY_NAME = 'ゲスト';

/** 退室時刻・表示名を記録するキー（部屋ごと）。同一部屋に戻ったとき「おかえりなさい」に使う */
export function getLastExitStorageKey(roomId: string): string {
  return `mc:last_exit:${roomId}`;
}

function getChannelName(roomId: string): string {
  return `room:${roomId}`;
}

function getValidKey(): string | null {
  const key = process.env.NEXT_PUBLIC_ABLY_API_KEY;
  if (typeof key === 'string' && key.trim() !== '') return key;
  return null;
}

export interface AblyProviderWrapperProps {
  displayName?: string;
  roomId: string;
  isGuest?: boolean;
  roomTitle?: string;
  /** room_lobby_message.display_title（部屋の表示用タイトル） */
  roomDisplayTitle?: string;
  /** 同一部屋で安定した clientId（presence・強制退出の対象識別用） */
  clientId?: string;
}

export function AblyProviderWrapper({
  displayName = DEFAULT_DISPLAY_NAME,
  roomId,
  isGuest = false,
  roomTitle = '',
  roomDisplayTitle = '',
  clientId: clientIdProp = '',
}: AblyProviderWrapperProps) {
  const router = useRouter();
  const key = getValidKey();
  const client = useMemo(() => {
    if (!key) return null;
    const opts: { key: string; clientId?: string } = { key };
    if (clientIdProp && clientIdProp.trim()) opts.clientId = clientIdProp.trim();
    return new Ably.Realtime(opts);
  }, [key, clientIdProp]);
  const channelName = getChannelName(roomId);

  const postParticipation = useCallback(
    async (action: 'join' | 'leave', keepalive = false) => {
      if (isGuest) return;
      try {
        await fetch('/api/user-room-participation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive,
          body: JSON.stringify({ action, roomId }),
        });
      } catch {
        // 参加履歴は失敗してもUIを止めない
      }
    },
    [isGuest, roomId],
  );

  useEffect(() => {
    if (isGuest) return;
    const supabase = createClient();
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session?.user?.id) return;
      void postParticipation('join');
    });

    const onBeforeUnload = () => {
      void postParticipation('leave', true);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      mounted = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
      void postParticipation('leave', true);
    };
  }, [isGuest, postParticipation]);

  const handleLeave = useCallback(() => {
    void postParticipation('leave', true);
    try {
      sessionStorage.setItem(
        getLastExitStorageKey(roomId),
        JSON.stringify({ timestamp: Date.now(), displayName })
      );
      sessionStorage.removeItem(GUEST_STORAGE_KEY);
      sessionStorage.removeItem(GUEST_NAME_STORAGE_KEY);
      sessionStorage.removeItem(GUEST_ROOM_KEY);
    } catch {}
    router.push('/');
  }, [router, roomId, displayName, postParticipation]);

  if (!client) {
    return (
      <RoomWithoutSync
        displayName={displayName}
        roomId={roomId}
        roomTitle={roomTitle}
        roomDisplayTitle={roomDisplayTitle}
        isGuest={isGuest}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <AblyProviderBase client={client}>
      <ChannelProvider channelName={channelName}>
        <RoomWithSync
          displayName={displayName}
          channelName={channelName}
          roomId={roomId}
          roomTitle={roomTitle}
          roomDisplayTitle={roomDisplayTitle}
          isGuest={isGuest}
          onLeave={handleLeave}
          clientId={clientIdProp}
        />
      </ChannelProvider>
    </AblyProviderBase>
  );
}
