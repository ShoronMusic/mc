'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JoinChoice, GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from './JoinChoice';
import { FROM_START_KEY } from './FromStartMarker';
import { AblyProviderWrapper } from '@/components/providers/AblyProviderWrapper';
import { getOrCreateRoomClientId, isKickedForRoom } from '@/lib/room-owner';
import { readTermsAccepted } from '@/lib/terms-consent';

type GateStatus = 'loading' | 'choice' | 'room' | 'kicked';

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
      router.replace(`/consent?next=${encodeURIComponent(`/${roomId}`)}`);
      setConsentOk(false);
      return;
    }
    setConsentOk(true);
  }, [roomId, router]);

  useEffect(() => {
    if (consentOk !== true) return;

    if (clientId && isKickedForRoom(roomId, clientId)) {
      setStatus('kicked');
      return;
    }

    const supabase = createClient();
    const fromStart = typeof window !== 'undefined' && sessionStorage.getItem(FROM_START_KEY);

    if (typeof window !== 'undefined' && !fromStart && sessionStorage.getItem(GUEST_STORAGE_KEY)) {
      const savedRoom = sessionStorage.getItem(GUEST_ROOM_KEY);
      if (savedRoom === roomId) {
        const savedName = sessionStorage.getItem(GUEST_NAME_STORAGE_KEY);
        setDisplayName(savedName && savedName.trim() ? savedName.trim() : 'ゲスト');
        setIsGuest(true);
        setStatus('room');
        return;
      }
    }

    if (!supabase) {
      setStatus('choice');
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setDisplayName(getDisplayNameFromUser(session.user));
        setIsGuest(false);
        clearFromStart();
        setStatus('room');
      } else {
        setStatus('choice');
      }
    });
  }, [roomId, clientId, consentOk]);

  const handleJoin = (name: string, mode: 'guest' | 'registered') => {
    setDisplayName(name);
    setIsGuest(mode === 'guest');
    try {
      sessionStorage.removeItem(FROM_START_KEY);
    } catch {}
    setStatus('room');
  };

  if (consentOk !== true || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-gray-400">読み込み中…</p>
      </div>
    );
  }

  if (status === 'choice') {
    return <JoinChoice onJoin={handleJoin} roomId={roomId} />;
  }

  if (status === 'kicked') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-4">
        <p className="text-center text-lg text-amber-200">
          オーナーにより退出させられました。3時間はこのルームに入室できません。
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

  return (
    <AblyProviderWrapper
      displayName={displayName}
      roomId={roomId}
      isGuest={isGuest}
      clientId={clientId}
    />
  );
}
