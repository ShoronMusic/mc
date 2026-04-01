'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

const POLL_MS = 20_000;
const NAME_PREVIEW_MAX = 8;

type LiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle?: string;
};

type RoomPayload = {
  roomId: string;
  count: number;
  names: string[];
  lobbyMessage?: string;
  jpAiUnlockEnabled?: boolean;
  error?: boolean;
};

type ApiResponse = {
  configured: boolean;
  rooms: RoomPayload[];
};

type LiveApiResponse = {
  configured: boolean;
  rooms: LiveRoom[];
  message?: string;
};

function formatNameLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= NAME_PREVIEW_MAX) return names.join('、');
  return `${names.slice(0, NAME_PREVIEW_MAX).join('、')} …他${names.length - NAME_PREVIEW_MAX}名`;
}

function RoomRow({
  room,
  configured,
  loading,
  payload,
}: {
  room: LiveRoom;
  configured: boolean;
  loading: boolean;
  payload: RoomPayload | undefined;
}) {
  const headline = (room.displayTitle?.trim() || room.title).trim();
  const label = `${headline} に入る`;

  let sub: ReactNode = null;
  if (configured) {
    if (loading && !payload) {
      sub = <span className="text-gray-500">参加状況を取得中…</span>;
    } else if (payload?.error) {
      sub = <span className="text-amber-500/90">参加状況を取得できませんでした</span>;
    } else if (payload) {
      const { count, names } = payload;
      if (count === 0) {
        sub = <span className="text-gray-500">現在 0 人</span>;
      } else {
        sub = (
          <span className="text-gray-400">
            <span className="text-gray-300">現在 {count} 人</span>
            {names.length > 0 && (
              <>
                <span className="text-gray-600"> · </span>
                {formatNameLine(names)}
              </>
            )}
          </span>
        );
      }
    }
  }

  const lobby = payload?.lobbyMessage?.trim();

  return (
    <Link
      href={`/${room.roomId}`}
      className="flex flex-col gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
    >
      <span className="text-center font-medium">{label}</span>
      <span className="text-center text-[11px] text-gray-500">ルームID: {room.roomId}</span>
      {payload?.jpAiUnlockEnabled && (
        <span className="text-center text-[11px] font-medium text-emerald-300">邦楽解禁</span>
      )}
      {lobby && (
        <span className="text-center text-xs leading-snug text-gray-300 break-words whitespace-pre-wrap">{lobby}</span>
      )}
      {sub && <span className="text-center text-xs leading-snug break-words">{sub}</span>}
    </Link>
  );
}

export function HomeRoomLinks() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [byId, setById] = useState<Record<string, RoomPayload>>({});
  const [message, setMessage] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const liveRes = await fetch('/api/room-live-status');
      const liveData = (await liveRes.json()) as LiveApiResponse;
      if (!liveData.configured) {
        setConfigured(false);
        setLiveRooms([]);
        setById({});
        setMessage(liveData.message?.trim() || '現在、会の開催管理が未設定です。');
        return;
      }

      setConfigured(true);
      setMessage('');
      const lives = Array.isArray(liveData.rooms) ? liveData.rooms : [];
      setLiveRooms(lives);

      if (lives.length === 0) {
        setById({});
        return;
      }

      const ids = lives.map((r) => r.roomId).join(',');
      const presenceRes = await fetch(`/api/room-presence?rooms=${encodeURIComponent(ids)}`);
      const data = (await presenceRes.json()) as ApiResponse;
      const next: Record<string, RoomPayload> = {};
      for (const r of data.rooms ?? []) {
        next[r.roomId] = r;
      }
      setById(next);
    } catch {
      setConfigured(true);
      setMessage('開催中の会を取得できませんでした。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      {configured === false && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-center text-xs leading-relaxed text-amber-200">
          {message || '会の開催管理が未設定です。'}
        </p>
      )}
      {configured === true && liveRooms.length === 0 && (
        <p className="rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 text-center text-sm text-gray-300">
          現在開催中の会はありません
        </p>
      )}
      {liveRooms.map((room) => (
        <RoomRow key={room.roomId} room={room} configured={configured === true} loading={loading} payload={byId[room.roomId]} />
      ))}
      {configured === true && liveRooms.length > 0 && (
        <p className="text-center text-[11px] text-gray-600">参加状況は約{POLL_MS / 1000}秒ごとに更新されます</p>
      )}
    </div>
  );
}
