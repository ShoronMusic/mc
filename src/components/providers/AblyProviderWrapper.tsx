'use client';

import { AblyProvider as AblyProviderBase, ChannelProvider } from 'ably/react';
import Ably from 'ably';
import { useRouter } from 'next/navigation';
import { useMemo, useCallback } from 'react';
import { GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from '@/components/auth/JoinChoice';
import RoomWithSync from '@/components/room/RoomWithSync';
import RoomWithoutSync from '@/components/room/RoomWithoutSync';

const DEFAULT_DISPLAY_NAME = 'ゲスト';

/** 退室時刻・表示名を記録するキー（ルームごと）。同一ルームに戻ったとき「おかえりなさい」に使う */
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
  /** 同一ルームで安定した clientId（presence・強制退出の対象識別用） */
  clientId?: string;
}

export function AblyProviderWrapper({
  displayName = DEFAULT_DISPLAY_NAME,
  roomId,
  isGuest = false,
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

  const handleLeave = useCallback(() => {
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
  }, [router, roomId, displayName]);

  if (!client) {
    return (
      <RoomWithoutSync
        displayName={displayName}
        roomId={roomId}
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
          isGuest={isGuest}
          onLeave={handleLeave}
          clientId={clientIdProp}
        />
      </ChannelProvider>
    </AblyProviderBase>
  );
}
