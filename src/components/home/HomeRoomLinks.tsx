'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

const POLL_MS = 20_000;
const NAME_PREVIEW_MAX = 8;

type LiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle?: string;
  joinLocked?: boolean;
  canEnter?: boolean;
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
  const joinLocked = room.joinLocked === true;
  const canEnter = room.canEnter !== false;

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

  const body = (
    <>
      <span className="self-center rounded-full bg-emerald-600/25 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300">
        {joinLocked ? '開催中 🔒 新規締切' : '開催中'}
      </span>
      <span className="text-center font-medium">{label}</span>
      <span className="text-center text-[11px] text-gray-500">部屋ID: {room.roomId}</span>
      {payload?.jpAiUnlockEnabled && (
        <span className="text-center text-[11px] font-medium text-emerald-300">邦楽解禁</span>
      )}
      {lobby && (
        <span className="text-center text-xs leading-snug text-gray-300 break-words whitespace-pre-wrap">{lobby}</span>
      )}
      {joinLocked && !canEnter && (
        <span className="text-center text-xs leading-snug text-amber-300">
          新規参加は締切中です（既参加者のみ再入室できます）
        </span>
      )}
      {sub && <span className="text-center text-xs leading-snug break-words">{sub}</span>}
    </>
  );

  if (joinLocked && !canEnter) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-amber-700/60 bg-gray-800/80 px-4 py-3 text-gray-300">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/${room.roomId}`}
      className="flex flex-col gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700 hover:border-sky-600/50"
    >
      {body}
    </Link>
  );
}

export function HomeRoomLinks({
  onActivePresenceKnown,
}: {
  /** 初回取得完了後、参加者がいる開催中部屋の有無が変わったときに通知（並び順用） */
  onActivePresenceKnown?: (hasActive: boolean) => void;
} = {}) {
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

  const activeRooms = useMemo(
    () =>
      configured === true
        ? liveRooms.filter((room) => {
            const payload = byId[room.roomId];
            return !!payload && !payload.error && payload.count > 0;
          })
        : [],
    [configured, liveRooms, byId],
  );

  useEffect(() => {
    if (!onActivePresenceKnown) return;
    if (configured === false) {
      onActivePresenceKnown(false);
      return;
    }
    if (configured !== true || loading) return;
    onActivePresenceKnown(activeRooms.length > 0);
  }, [configured, loading, activeRooms.length, onActivePresenceKnown]);

  return (
    <div className="flex flex-col gap-3">
      {configured === false && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-center text-xs leading-relaxed text-amber-200">
          {message || '会の開催管理が未設定です。'}
        </p>
      )}
      {configured === true && message && (
        <p className="rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-center text-xs leading-relaxed text-amber-200">
          {message}
        </p>
      )}
      {configured === true && !loading && activeRooms.length === 0 && (
        <p className="rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 text-center text-sm text-gray-300">
          現在、参加者がいる開催中の部屋はありません。
        </p>
      )}
      {activeRooms.length > 0 && (
        <section
          className="rounded-xl border border-emerald-800/40 bg-gradient-to-b from-emerald-950/35 to-gray-900/40 p-3 shadow-inner sm:p-4"
          aria-labelledby="home-live-rooms-heading"
        >
          <div className="mb-3 flex flex-col items-center gap-1 border-b border-emerald-800/30 pb-3">
            <h2
              id="home-live-rooms-heading"
              className="text-center text-sm font-semibold text-emerald-100"
            >
              開催中の部屋（参加中）
            </h2>
            <p className="text-center text-[11px] leading-relaxed text-emerald-200/70">
              いま誰かが入室している会です。タップするとその部屋へ入れます。
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {activeRooms.map((room) => (
              <li key={room.roomId}>
                <RoomRow
                  room={room}
                  configured={configured === true}
                  loading={loading}
                  payload={byId[room.roomId]}
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[11px] text-emerald-200/50">
            参加人数・表示名は約{POLL_MS / 1000}秒ごとに更新されます
          </p>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-amber-300/90">
            既に参加者がいる部屋に入ると、再生中の音楽がすぐ流れる場合があります。
            <br />
            音量にご注意ください。
          </p>
        </section>
      )}
    </div>
  );
}
