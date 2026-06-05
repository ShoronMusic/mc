'use client';

import { AblyProvider as AblyProviderBase, ChannelProvider } from 'ably/react';
import Ably from 'ably';
import { useRouter } from 'next/navigation';
import { useMemo, useCallback, useEffect } from 'react';
import { clearGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { clearLastRoomEnter } from '@/lib/room-enter-resume';
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

export type LeaveRoomOptions = {
  /** false のとき PWA 復帰用スナップショットを残す（端末奪取でトップへ追いやられた場合） */
  clearResumeSnapshot?: boolean;
};

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
        const payload: { action: 'join' | 'leave'; roomId: string; displayName?: string } = {
          action,
          roomId,
        };
        if (action === 'join') {
          const dn = typeof displayName === 'string' ? displayName.trim() : '';
          if (dn) payload.displayName = dn;
        }
        await fetch('/api/user-room-participation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive,
          body: JSON.stringify(payload),
        });
      } catch {
        // 参加履歴は失敗してもUIを止めない
      }
    },
    [displayName, isGuest, roomId],
  );

  useEffect(() => {
    if (isGuest) return;
    const supabase = createClient();
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted) return;
      if (!user?.id) return;
      void postParticipation('join');
    });

    const onLeaveParticipation = () => {
      void postParticipation('leave', true);
    };
    window.addEventListener('beforeunload', onLeaveParticipation);
    return () => {
      mounted = false;
      window.removeEventListener('beforeunload', onLeaveParticipation);
      void postParticipation('leave', true);
    };
  }, [isGuest, postParticipation]);

  const handleLeave = useCallback(
    (options?: LeaveRoomOptions) => {
      void postParticipation('leave', true);
      try {
        sessionStorage.setItem(
          getLastExitStorageKey(roomId),
          JSON.stringify({ timestamp: Date.now(), displayName }),
        );
        if (options?.clearResumeSnapshot !== false) {
          clearGuestRoomPersistence();
          clearLastRoomEnter(roomId);
        }
      } catch {}
      router.push('/');
    },
    [router, roomId, displayName, postParticipation],
  );

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
