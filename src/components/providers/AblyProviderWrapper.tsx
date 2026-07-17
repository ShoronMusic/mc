'use client';

import { AblyProvider as AblyProviderBase, ChannelProvider } from 'ably/react';
import Ably from 'ably';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { clearLastRoomEnter } from '@/lib/room-enter-resume';
import RoomWithSync from '@/components/room/RoomWithSync';
import RoomWithoutSync from '@/components/room/RoomWithoutSync';
import { RoomAblySuspendedPlaceholder } from '@/components/room/RoomAblySuspendedPlaceholder';
import {
  registerActiveAblyClient,
} from '@/lib/ably-client-safe';
import { closeAblyClientSafely } from '@/lib/ably-client-lifecycle';
import {
  getAblyBackgroundSuspendMs,
  isAblyReduceTrafficWhenHidden,
} from '@/lib/ably-traffic-config';
import { AblyRoomTrafficProvider } from '@/lib/ably-room-traffic-context';
import { useAblyBackgroundSuspend } from '@/hooks/useAblyBackgroundSuspend';
import { createClient } from '@/lib/supabase/client';
import { getAblyRoomChannelName, getRoomProductScopedStorageKey } from '@/lib/room-product-scope';
import { isAblyClientAuthEnabled } from '@/lib/ably-client-auth';

const DEFAULT_DISPLAY_NAME = 'ゲスト';

/** 退室時刻・表示名を記録するキー（部屋ごと）。同一部屋に戻ったとき「おかえりなさい」に使う */
export function getLastExitStorageKey(roomId: string): string {
  return getRoomProductScopedStorageKey('mc:last_exit:', roomId);
}

function getChannelName(roomId: string): string {
  return getAblyRoomChannelName(roomId);
}

function buildAblyClient(roomId: string, clientId: string): Ably.Realtime {
  const cid = clientId.trim();
  const opts: Ably.ClientOptions = {
    authCallback: (tokenParams, callback) => {
      void fetch('/api/ably/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          clientId: cid || (typeof tokenParams.clientId === 'string' ? tokenParams.clientId : ''),
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            callback(data?.message || data?.error || `token HTTP ${res.status}`, null);
            return;
          }
          callback(null, data);
        })
        .catch((err) => {
          callback(err instanceof Error ? err.message : 'token fetch failed', null);
        });
    },
    disconnectedRetryTimeout: 15_000,
    suspendedRetryTimeout: 30_000,
    closeOnUnload: true,
  };
  if (cid) opts.clientId = cid;
  return new Ably.Realtime(opts);
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
  const ablyEnabled = isAblyClientAuthEnabled();
  const { documentHidden, backgroundSuspended } = useAblyBackgroundSuspend();
  const [ablyClient, setAblyClient] = useState<Ably.Realtime | null>(null);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const suspendAfterMinutes = Math.max(1, Math.round(getAblyBackgroundSuspendMs() / 60_000));

  const trafficState = useMemo(
    () => ({
      documentHidden,
      backgroundSuspended,
      reduceTrafficWhenHidden: isAblyReduceTrafficWhenHidden(),
    }),
    [documentHidden, backgroundSuspended],
  );

  useEffect(() => {
    if (!ablyEnabled || backgroundSuspended) {
      closeAblyClientSafely(ablyClientRef.current);
      ablyClientRef.current = null;
      setAblyClient(null);
      return;
    }

    const cid = clientIdProp?.trim() ?? '';
    if (!cid) {
      closeAblyClientSafely(ablyClientRef.current);
      ablyClientRef.current = null;
      setAblyClient(null);
      return;
    }

    const next = buildAblyClient(roomId, cid);
    ablyClientRef.current = next;
    registerActiveAblyClient(next);
    setAblyClient(next);

    const onFailed = (stateChange: Ably.ConnectionStateChange) => {
      if (stateChange.current === 'closed') return;
      // eslint-disable-next-line no-console
      console.warn('[Ably] connection state:', stateChange.current, stateChange.reason ?? '');
    };
    next.connection.on('failed', onFailed);

    return () => {
      next.connection.off('failed', onFailed);
      closeAblyClientSafely(next);
      if (ablyClientRef.current === next) {
        ablyClientRef.current = null;
      }
    };
  }, [ablyEnabled, roomId, clientIdProp, backgroundSuspended]);

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

  if (!ablyEnabled) {
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

  if (backgroundSuspended) {
    return (
      <RoomAblySuspendedPlaceholder
        roomTitle={roomTitle}
        roomDisplayTitle={roomDisplayTitle}
        suspendAfterMinutes={suspendAfterMinutes}
        onLeave={() => handleLeave()}
      />
    );
  }

  if (!ablyClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4 text-sm text-gray-300">
        接続を準備しています…
      </div>
    );
  }

  return (
    <AblyRoomTrafficProvider value={trafficState}>
      <AblyProviderBase client={ablyClient}>
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
    </AblyRoomTrafficProvider>
  );
}
