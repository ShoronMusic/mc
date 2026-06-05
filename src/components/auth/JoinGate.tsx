'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JoinChoice } from './JoinChoice';
import { FROM_START_KEY } from './FromStartMarker';
import { AblyProviderWrapper } from '@/components/providers/AblyProviderWrapper';
import { getRoomClientId, isKickedForRoom, isKickedSitewide } from '@/lib/room-owner';
import { fetchRoomAuthSessionCheck } from '@/lib/room-auth-session-check-client';
import { regenerateRoomSessionClaim } from '@/lib/room-session-instance';
import {
  clearGuestRoomPersistence,
  rememberGuestRoom,
  readGuestRoomForRoom,
} from '@/lib/guest-room-persistence';
import {
  consumeShareRoomEnterPending,
  getKnownAuthUserId,
  hasPendingShareChatText,
  isShareRoomEnterPending,
  rememberKnownAuthUserId,
} from '@/lib/share-target-pending';
import { getLastRoomEnterForRoom, rememberLastRoomEnter } from '@/lib/room-enter-resume';
import { resolveSupabaseUserClient } from '@/lib/supabase/resolve-user-client';
import { RoomSessionTakeoverJoinModal } from '@/components/room/RoomSessionTakeoverJoinModal';
import { readTermsAccepted } from '@/lib/terms-consent';
import { runRoomEntryGateCheck } from '@/lib/join-gate-room-check-client';

type GateStatus = 'loading' | 'choice' | 'room' | 'kicked' | 'closed' | 'session_takeover_confirm';

type PendingEnter = {
  displayName: string;
  isGuest: boolean;
  authUserId: string | null;
};

function getDisplayNameFromUser(user: { user_metadata?: { display_name?: string; name?: string }; email?: string }): string {
  const meta = user?.user_metadata;
  if (meta?.display_name && typeof meta.display_name === 'string') return meta.display_name;
  if (meta?.name && typeof meta.name === 'string') return meta.name;
  if (user?.email) return user.email.split('@')[0];
  return 'ユーザー';
}

function isRenderableComponent(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return '$$typeof' in (value as Record<string, unknown>);
}

interface JoinGateProps {
  roomId: string;
}

export function JoinGate({ roomId }: JoinGateProps) {
  const router = useRouter();
  const [consentOk, setConsentOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState<GateStatus>('loading');
  const [displayName, setDisplayName] = useState<string>('ゲスト');
  const [isGuest, setIsGuest] = useState(false);
  const [closedMessage, setClosedMessage] = useState<string>('');
  const [liveTitle, setLiveTitle] = useState<string>('');
  const [roomDisplayTitle, setRoomDisplayTitle] = useState<string>('');
  const [joinVerifying, setJoinVerifying] = useState(false);
  const [loadingHint, setLoadingHint] = useState('読み込み中…');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [pendingEnter, setPendingEnter] = useState<PendingEnter | null>(null);
  const autoEnterAttemptedRef = useRef(false);
  const skipSessionGateRef = useRef(false);

  const clientId = useMemo(
    () =>
      typeof window !== 'undefined' ? getRoomClientId(roomId, isGuest ? null : authUserId) : '',
    [roomId, authUserId, isGuest],
  );

  const clearFromStart = () => {
    try {
      sessionStorage.removeItem(FROM_START_KEY);
    } catch {}
  };

  const commitEnterRoom = useCallback(
    (enter: PendingEnter) => {
      if (!enter.isGuest && enter.authUserId) {
        regenerateRoomSessionClaim(roomId);
        rememberKnownAuthUserId(enter.authUserId);
      }
      setDisplayName(enter.displayName);
      setIsGuest(enter.isGuest);
      setAuthUserId(enter.isGuest ? null : enter.authUserId);
      setPendingEnter(null);
      clearFromStart();
      rememberLastRoomEnter({
        roomId,
        displayName: enter.displayName,
        isGuest: enter.isGuest,
        authUserId: enter.isGuest ? null : enter.authUserId,
      });
      if (enter.isGuest) {
        rememberGuestRoom(roomId, enter.displayName);
      } else {
        clearGuestRoomPersistence();
      }
      setStatus('room');
    },
    [roomId],
  );

  const tryEnterRoom = useCallback(
    async (enter: PendingEnter) => {
      if (!enter.isGuest && enter.authUserId) {
        if (skipSessionGateRef.current) {
          commitEnterRoom(enter);
          return;
        }
        const check = await fetchRoomAuthSessionCheck(roomId);
        if (!check.ok) {
          window.alert(check.error);
          return;
        }
        if (check.configured && check.sameAccountInRoom) {
          setPendingEnter(enter);
          setStatus('session_takeover_confirm');
          return;
        }
      }
      commitEnterRoom(enter);
    },
    [roomId, commitEnterRoom],
  );

  useEffect(() => {
    if (!readTermsAccepted()) {
      const nextPath =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : `/${roomId}`;
      router.replace(`/consent?next=${encodeURIComponent(nextPath)}`);
      setConsentOk(false);
      return;
    }
    setConsentOk(true);
  }, [roomId, router]);

  useEffect(() => {
    if (consentOk !== true) return;

    const checkRoomLive = async (): Promise<boolean> => {
      const gate = await runRoomEntryGateCheck(roomId);
      if (!gate.ok) {
        setClosedMessage(gate.closedMessage);
        setLiveTitle(gate.liveTitle);
        setRoomDisplayTitle(gate.roomDisplayTitle);
        setStatus('closed');
        return false;
      }
      setLiveTitle(gate.liveTitle);
      setRoomDisplayTitle(gate.roomDisplayTitle);
      return true;
    };

    const supabase = createClient();
    const fromStart = typeof window !== 'undefined' && sessionStorage.getItem(FROM_START_KEY);

    const tryEnterAsGuestFromStorage = (): boolean => {
      if (typeof window === 'undefined' || fromStart) return false;
      const guest = readGuestRoomForRoom(roomId);
      if (!guest) return false;
      setDisplayName(guest.displayName);
      setIsGuest(true);
      setStatus('room');
      return true;
    };

    void checkRoomLive().then(async (isLive) => {
      if (!isLive) return;

      if (!supabase) {
        if (!tryEnterAsGuestFromStorage()) setStatus('choice');
        return;
      }

      const fromShare = hasPendingShareChatText() || isShareRoomEnterPending();
      const lastEnter = fromStart ? null : getLastRoomEnterForRoom(roomId);
      const shouldResumeEnter = !fromStart && (fromShare || Boolean(lastEnter));
      if (shouldResumeEnter) {
        setLoadingHint(fromShare ? '共有から部屋に戻っています…' : '部屋に戻っています…');
        skipSessionGateRef.current = true;
      }

      const user = await resolveSupabaseUserClient({
        maxWaitMs: shouldResumeEnter || getKnownAuthUserId() ? 12000 : 2500,
        tryRefreshSession: shouldResumeEnter || Boolean(getKnownAuthUserId()),
      });

      if (user) {
        const cid = getRoomClientId(roomId, user.id);
        if (isKickedForRoom(roomId, cid) || isKickedSitewide()) {
          setStatus('kicked');
          return;
        }
      }

      if (lastEnter?.isGuest) {
        if (autoEnterAttemptedRef.current) return;
        autoEnterAttemptedRef.current = true;
        if (fromShare) consumeShareRoomEnterPending();
        commitEnterRoom({
          displayName: lastEnter.displayName,
          isGuest: true,
          authUserId: null,
        });
        return;
      }

      if (
        !user &&
        lastEnter &&
        !lastEnter.isGuest &&
        lastEnter.authUserId &&
        (!getKnownAuthUserId() || getKnownAuthUserId() === lastEnter.authUserId)
      ) {
        if (autoEnterAttemptedRef.current) return;
        const cid = getRoomClientId(roomId, lastEnter.authUserId);
        if (isKickedForRoom(roomId, cid) || isKickedSitewide()) {
          setStatus('kicked');
          return;
        }
        autoEnterAttemptedRef.current = true;
        if (fromShare) consumeShareRoomEnterPending();
        void tryEnterRoom({
          displayName: lastEnter.displayName,
          isGuest: false,
          authUserId: lastEnter.authUserId,
        });
        return;
      }

      if (user) {
        if (autoEnterAttemptedRef.current) return;
        autoEnterAttemptedRef.current = true;
        rememberKnownAuthUserId(user.id);
        clearGuestRoomPersistence();
        setAuthUserId(user.id);
        setDisplayName(getDisplayNameFromUser(user));
        setIsGuest(false);
        if (fromShare) consumeShareRoomEnterPending();
        void tryEnterRoom({
          displayName: getDisplayNameFromUser(user),
          isGuest: false,
          authUserId: user.id,
        });
        return;
      }

      setAuthUserId(null);
      if (fromShare) consumeShareRoomEnterPending();
      if (!tryEnterAsGuestFromStorage()) setStatus('choice');
    });
  }, [roomId, consentOk, tryEnterRoom, commitEnterRoom]);

  const handleJoin = async (name: string, mode: 'guest' | 'registered') => {
    setJoinVerifying(true);
    try {
      const gate = await runRoomEntryGateCheck(roomId);
      if (!gate.ok) {
        setClosedMessage(gate.closedMessage);
        setLiveTitle(gate.liveTitle);
        setRoomDisplayTitle(gate.roomDisplayTitle);
        setStatus('closed');
        return;
      }
      setLiveTitle(gate.liveTitle);
      setRoomDisplayTitle(gate.roomDisplayTitle);
      let nextAuthUserId: string | null = null;
      if (mode === 'guest') {
        nextAuthUserId = null;
      } else {
        const supabase = createClient();
        if (supabase) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          nextAuthUserId = user?.id ?? null;
        }
      }
      await tryEnterRoom({
        displayName: name,
        isGuest: mode === 'guest',
        authUserId: nextAuthUserId,
      });
    } finally {
      setJoinVerifying(false);
    }
  };

  if (consentOk !== true || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">{loadingHint}</p>
      </div>
    );
  }

  if (status === 'session_takeover_confirm') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <RoomSessionTakeoverJoinModal
          roomId={roomId}
          onConfirm={() => {
            skipSessionGateRef.current = true;
            if (pendingEnter) commitEnterRoom(pendingEnter);
          }}
          onCancel={() => {
            setPendingEnter(null);
            router.push('/');
          }}
        />
      </div>
    );
  }

  if (status === 'choice') {
    if (!isRenderableComponent(JoinChoice)) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-950 p-4 text-gray-200">
          <p>入室UIの読み込みに失敗しました。再読込してください。</p>
        </div>
      );
    }
    return <JoinChoice onJoin={handleJoin} roomId={roomId} joinVerifying={joinVerifying} />;
  }

  if (status === 'kicked') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-4">
        <p className="text-center text-lg text-amber-200">
          利用制限中です。しばらくの間、この部屋またはサイトに入室できません。
        </p>
        <a
          href="/"
          className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
        >
          トップに戻る
        </a>
      </div>
    );
  }

  if (status === 'closed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-4">
        <p className="max-w-lg text-center text-lg text-gray-100">
          {closedMessage || '現在この部屋は開催中ではないため入室できません。'}
        </p>
        {liveTitle && (
          <p className="text-center text-sm text-gray-300">
            開催中: {liveTitle}
          </p>
        )}
        <a
          href="/"
          className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
        >
          トップに戻る
        </a>
      </div>
    );
  }

  if (!isRenderableComponent(AblyProviderWrapper)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-950 p-4 text-gray-200">
        <p>部屋の初期化に失敗しました。再読込してください。</p>
      </div>
    );
  }

  return (
    <AblyProviderWrapper
      displayName={displayName}
      roomId={roomId}
      roomTitle={liveTitle}
      roomDisplayTitle={roomDisplayTitle}
      isGuest={isGuest}
      clientId={clientId}
    />
  );
}

export default JoinGate;
