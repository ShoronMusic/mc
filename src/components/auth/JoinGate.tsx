'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { JoinChoice, GUEST_STORAGE_KEY, GUEST_NAME_STORAGE_KEY, GUEST_ROOM_KEY } from './JoinChoice';
import { FROM_START_KEY } from './FromStartMarker';
import { AblyProviderWrapper } from '@/components/providers/AblyProviderWrapper';
import { getOrCreateRoomClientId, isKickedForRoom } from '@/lib/room-owner';
import { readTermsAccepted } from '@/lib/terms-consent';
import { isTrialRoomId } from '@/lib/trial-rooms';

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

    if (clientId && isKickedForRoom(roomId, clientId)) {
      setStatus('kicked');
      return;
    }

    const checkRoomLive = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/room-live-status?roomId=${encodeURIComponent(roomId)}`);
        const data = (await res.json()) as {
          configured?: boolean;
          message?: string;
          room?: {
            isLive?: boolean;
            title?: string | null;
            displayTitle?: string | null;
            isOrganizer?: boolean;
          };
        };
        if (data?.configured !== true) {
          setClosedMessage(data?.message?.trim() || '現在このルームは開催管理の準備中です。');
          setLiveTitle('');
          setRoomDisplayTitle('');
          setStatus('closed');
          return false;
        }
        const trialRoom = isTrialRoomId(roomId);
        if (data?.room?.isLive !== true && !trialRoom) {
          setClosedMessage('現在このルームで開催中の会はありません。');
          setLiveTitle('');
          setRoomDisplayTitle('');
          setStatus('closed');
          return false;
        }
        if (data?.room?.isLive === true) {
          setLiveTitle(typeof data?.room?.title === 'string' ? data.room.title.trim() : '');
          setRoomDisplayTitle(
            typeof data?.room?.displayTitle === 'string' ? data.room.displayTitle.trim() : '',
          );
        } else {
          setLiveTitle(trialRoom ? '体験ルーム' : '');
          setRoomDisplayTitle('');
        }

        // 参加者0人のときは、開催中の会の主催者だけ先に入室できる。
        // （未参加ユーザーが最初に入ってしまうのを防ぐ）
        try {
          const p = await fetch(`/api/room-presence?rooms=${encodeURIComponent(roomId)}`);
          const pd = (await p.json()) as {
            configured?: boolean;
            rooms?: Array<{ roomId: string; count: number }>;
          };
          if (pd?.configured === true) {
            const row = Array.isArray(pd.rooms) ? pd.rooms.find((r) => r.roomId === roomId) : null;
            const count = row?.count ?? 0;
            const isOrganizer = data?.room?.isOrganizer === true;
            if (count === 0 && !isOrganizer && !isTrialRoomId(roomId)) {
              setClosedMessage('主催者の入室待ちです。主催者が先に入室すると参加できます。');
              setStatus('closed');
              return false;
            }
          }
        } catch {
          // 参加者数取得に失敗した場合は live 判定のみで通す
        }
        return true;
      } catch {
        setClosedMessage('開催状況を確認できませんでした。時間をおいて再度お試しください。');
        setLiveTitle('');
        setRoomDisplayTitle('');
        setStatus('closed');
        return false;
      }
    };

    const supabase = createClient();
    const fromStart = typeof window !== 'undefined' && sessionStorage.getItem(FROM_START_KEY);

    void checkRoomLive().then((isLive) => {
      if (!isLive) return;

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

  if (status === 'closed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 p-4">
        <p className="max-w-lg text-center text-lg text-gray-100">
          {closedMessage || '現在このルームは開催中ではないため入室できません。'}
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
