'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JoinChoice, GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from './JoinChoice';
import { FROM_START_KEY } from './FromStartMarker';
import { AblyProviderWrapper } from '@/components/providers/AblyProviderWrapper';
import { getOrCreateRoomClientId, isKickedForRoom, isKickedSitewide } from '@/lib/room-owner';
import { readTermsAccepted } from '@/lib/terms-consent';
import { runRoomEntryGateCheck } from '@/lib/join-gate-room-check-client';

type GateStatus = 'loading' | 'choice' | 'room' | 'kicked' | 'closed';

function getDisplayNameFromUser(user: { user_metadata?: { display_name?: string; name?: string }; email?: string }): string {
  const meta = user?.user_metadata;
  if (meta?.display_name && typeof meta.display_name === 'string') return meta.display_name;
  if (meta?.name && typeof meta.name === 'string') return meta.name;
  if (user?.email) return user.email.split('@')[0];
  return 'ユーザー';
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

  const clientId = useMemo(
    () => (typeof window !== 'undefined' ? getOrCreateRoomClientId(roomId) : ''),
    [roomId]
  );

  const clearFromStart = () => {
    try {
      sessionStorage.removeItem(FROM_START_KEY);
    } catch {}
  };

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

    if (clientId && (isKickedForRoom(roomId, clientId) || isKickedSitewide())) {
      setStatus('kicked');
      return;
    }

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
      if (!sessionStorage.getItem(GUEST_STORAGE_KEY)) return false;
      const savedRoom = sessionStorage.getItem(GUEST_ROOM_KEY);
      if (savedRoom !== roomId) return false;
      const savedName = sessionStorage.getItem(GUEST_NAME_STORAGE_KEY);
      setDisplayName(savedName && savedName.trim() ? savedName.trim() : 'ゲスト');
      setIsGuest(true);
      setStatus('room');
      return true;
    };

    void checkRoomLive().then((isLive) => {
      if (!isLive) return;

      if (!supabase) {
        if (!tryEnterAsGuestFromStorage()) setStatus('choice');
        return;
      }

      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          try {
            sessionStorage.removeItem(GUEST_STORAGE_KEY);
            sessionStorage.removeItem(GUEST_NAME_STORAGE_KEY);
            sessionStorage.removeItem(GUEST_ROOM_KEY);
          } catch {
            /* ignore */
          }
          setDisplayName(getDisplayNameFromUser(user));
          setIsGuest(false);
          clearFromStart();
          setStatus('room');
          return;
        }
        if (!tryEnterAsGuestFromStorage()) setStatus('choice');
      });
    });
  }, [roomId, clientId, consentOk]);

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
      setDisplayName(name);
      setIsGuest(mode === 'guest');
      try {
        sessionStorage.removeItem(FROM_START_KEY);
      } catch {}
      setStatus('room');
    } finally {
      setJoinVerifying(false);
    }
  };

  if (consentOk !== true || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">読み込み中…</p>
      </div>
    );
  }

  if (status === 'choice') {
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
