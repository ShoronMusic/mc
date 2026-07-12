'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildDevMockActiveRoomsData,
  getDevMockActiveRoomsCount,
} from '@/lib/dev-mock-active-rooms';
import { HOME_EXCLUDED_LIVE_ROOM_IDS } from '@/lib/home-excluded-live-room-ids';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

const POLL_MS = 20_000;

type LiveRoom = {
  roomId: string;
  title: string;
  startedAt: string | null;
  displayTitle?: string;
  joinLocked?: boolean;
  canEnter?: boolean;
  hostDisplayName?: string | null;
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

type LiveRoomSortKey = 'new' | 'old' | 'participantsMany' | 'participantsFew';

function startedAtMs(startedAt: string | null | undefined): number {
  if (!startedAt?.trim()) return Number.POSITIVE_INFINITY;
  const t = new Date(startedAt).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function sortActiveRooms(
  rooms: LiveRoom[],
  byId: Record<string, RoomPayload>,
  sortKey: LiveRoomSortKey,
): LiveRoom[] {
  const copy = [...rooms];
  copy.sort((a, b) => {
    switch (sortKey) {
      case 'new':
        return startedAtMs(b.startedAt) - startedAtMs(a.startedAt);
      case 'old':
        return startedAtMs(a.startedAt) - startedAtMs(b.startedAt);
      case 'participantsMany': {
        const countDiff = (byId[b.roomId]?.count ?? 0) - (byId[a.roomId]?.count ?? 0);
        if (countDiff !== 0) return countDiff;
        return startedAtMs(b.startedAt) - startedAtMs(a.startedAt);
      }
      case 'participantsFew': {
        const countDiff = (byId[a.roomId]?.count ?? 0) - (byId[b.roomId]?.count ?? 0);
        if (countDiff !== 0) return countDiff;
        return startedAtMs(b.startedAt) - startedAtMs(a.startedAt);
      }
      default:
        return 0;
    }
  });
  return copy;
}

function formatNameLine(names: string[]): string {
  return names.join('、');
}

function formatRoomStartedAt(startedAt: string | null | undefined): string | null {
  if (!startedAt?.trim()) return null;
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function LiveRoomSortButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? IS_MC_PRODUCT
            ? 'mc-accent-sort-active rounded-md px-2.5 py-1 text-[11px] font-medium'
            : 'rounded-md border border-emerald-500/60 bg-emerald-900/45 px-2.5 py-1 text-[11px] font-medium text-emerald-100'
          : 'rounded-md border border-gray-600 bg-gray-800/70 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition hover:border-gray-500 hover:text-gray-200'
      }
    >
      {label}
    </button>
  );
}

function RoomRow({
  room,
  configured,
  loading,
  payload,
  viewOnly = false,
}: {
  room: LiveRoom;
  configured: boolean;
  loading: boolean;
  payload: RoomPayload | undefined;
  viewOnly?: boolean;
}) {
  const headline = (room.displayTitle?.trim() || room.title).trim();
  const startedAtLabel = formatRoomStartedAt(room.startedAt);
  const joinLocked = room.joinLocked === true;
  const canEnter = room.canEnter !== false;
  const lobby = payload?.lobbyMessage?.trim();

  let participantLine: ReactNode = null;
  if (configured) {
    if (loading && !payload) {
      participantLine = <span className="text-gray-500">参加状況を取得中…</span>;
    } else if (payload?.error) {
      participantLine = <span className="text-amber-500/90">参加状況を取得できませんでした</span>;
    } else if (payload) {
      const { count, names } = payload;
      if (count === 0) {
        participantLine = <span className="text-gray-500">参加者 0 人</span>;
      } else {
        participantLine = (
          <>
            <span className="text-gray-300">参加者 {count} 人</span>
            {names.length > 0 && (
              <>
                <span className="text-gray-600"> · </span>
                <span className="text-gray-400">{formatNameLine(names)}</span>
              </>
            )}
          </>
        );
      }
    }
  }

  const prLine =
    lobby || payload?.jpAiUnlockEnabled ? (
      <p className="text-left text-xs leading-snug text-gray-300 break-words whitespace-pre-wrap">
        {payload?.jpAiUnlockEnabled && !IS_MC_PRODUCT && (
          <span className="font-medium text-emerald-300">邦楽解禁</span>
        )}
        {payload?.jpAiUnlockEnabled && !IS_MC_PRODUCT && lobby ? (
          <span className="text-gray-600"> · </span>
        ) : null}
        {lobby}
      </p>
    ) : null;

  const noticeLine =
    joinLocked && !canEnter ? (
      <p className="text-left text-xs leading-snug text-amber-300">
        新規参加は締切中です（既参加者のみ再入室できます）
      </p>
    ) : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-left font-medium leading-snug break-words">{headline}</p>
        {startedAtLabel ? (
          <span className="shrink-0 text-right text-[11px] tabular-nums leading-snug text-gray-500">
            {startedAtLabel}
          </span>
        ) : null}
      </div>
      <p className="text-left text-[11px] leading-snug text-gray-500 break-words">
        {participantLine}
        {participantLine ? <span className="text-gray-600"> · </span> : null}
        <span>部屋ID: {room.roomId}</span>
      </p>
      {prLine}
      {noticeLine}
    </>
  );

  if (viewOnly || (joinLocked && !canEnter)) {
    return (
      <div
        className={`flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-gray-300 ${
          joinLocked && !canEnter
            ? 'border-amber-700/60 bg-gray-800/80'
            : 'border-gray-600 bg-gray-800/80'
        }`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/${room.roomId}`}
      className={`flex flex-col gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700 ${
        IS_MC_PRODUCT ? 'hover:border-green-600/40' : 'hover:border-sky-600/50'
      }`}
    >
      {body}
    </Link>
  );
}

export function HomeRoomLinks({ viewOnly = false }: { viewOnly?: boolean }) {
  const [mockBoot] = useState(() => {
    const count = getDevMockActiveRoomsCount();
    if (count <= 0) {
      return {
        enabled: false as const,
        count: 0,
        liveRooms: [] as LiveRoom[],
        byId: {} as Record<string, RoomPayload>,
      };
    }
    const data = buildDevMockActiveRoomsData(count);
    return { enabled: true as const, count, liveRooms: data.liveRooms, byId: data.byId };
  });
  const mockEnabled = mockBoot.enabled;
  const mockRoomCount = mockBoot.count;
  const [configured, setConfigured] = useState<boolean | null>(mockEnabled ? true : null);
  const [loading, setLoading] = useState(!mockEnabled);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>(mockBoot.liveRooms);
  const [byId, setById] = useState<Record<string, RoomPayload>>(mockBoot.byId);
  const [message, setMessage] = useState<string>('');
  const [sortKey, setSortKey] = useState<LiveRoomSortKey>('new');

  const load = useCallback(async () => {
    if (mockEnabled) return;
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
      const lives = (Array.isArray(liveData.rooms) ? liveData.rooms : []).filter(
        (r) => !HOME_EXCLUDED_LIVE_ROOM_IDS.has(String(r.roomId ?? '').trim()),
      );
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
  }, [mockEnabled]);

  useEffect(() => {
    if (mockEnabled) return;
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load, mockEnabled]);

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

  const sortedActiveRooms = useMemo(
    () => sortActiveRooms(activeRooms, byId, sortKey),
    [activeRooms, byId, sortKey],
  );

  return (
    <div className="flex flex-col gap-3">
      {mockEnabled && (
        <p className="rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-2 text-center text-xs leading-relaxed text-sky-200">
          開発用モック: 開催中部屋を {mockRoomCount} 件表示しています（
          <code className="text-[10px] text-sky-100">NEXT_PUBLIC_DEV_MOCK_ACTIVE_ROOMS</code>
          ）。リンク先の部屋は実在しません。
        </p>
      )}
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
          className={`rounded-xl border p-3 shadow-inner sm:p-4 ${
            IS_MC_PRODUCT
              ? 'border-gray-300 bg-gray-50'
              : 'border-emerald-800/40 bg-gradient-to-b from-emerald-950/35 to-gray-900/40'
          }`}
          aria-labelledby="home-live-rooms-heading"
        >
          <div
            className={`mb-3 flex flex-col gap-2 border-b pb-3 ${
              IS_MC_PRODUCT ? 'border-gray-200' : 'border-emerald-800/30'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <h2
                id="home-live-rooms-heading"
                className={`text-center text-sm font-semibold ${
                  IS_MC_PRODUCT ? 'text-gray-900' : 'text-emerald-100'
                }`}
              >
                開催中の部屋（参加中）
              </h2>
              <p
                className={`text-center text-[11px] leading-relaxed ${
                  IS_MC_PRODUCT ? 'text-gray-600' : 'text-emerald-200/70'
                }`}
              >
                {viewOnly
                  ? 'いま誰かが入室している会の一覧です（閲覧のみ・入室はできません）。'
                  : 'いま誰かが入室している会です。タップするとその部屋へ入れます。'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="並び替え">
              <span
                className={`text-[11px] font-medium ${
                  IS_MC_PRODUCT ? 'text-gray-600' : 'text-emerald-200/80'
                }`}
              >
                開始時間
              </span>
              <LiveRoomSortButton
                active={sortKey === 'new'}
                label="NEW"
                onClick={() => setSortKey('new')}
              />
              <LiveRoomSortButton
                active={sortKey === 'old'}
                label="OLD"
                onClick={() => setSortKey('old')}
              />
              <span
                className={`ml-0.5 text-[11px] font-medium ${
                  IS_MC_PRODUCT ? 'text-gray-600' : 'text-emerald-200/80'
                }`}
              >
                参加者
              </span>
              <LiveRoomSortButton
                active={sortKey === 'participantsMany'}
                label="多い"
                onClick={() => setSortKey('participantsMany')}
              />
              <LiveRoomSortButton
                active={sortKey === 'participantsFew'}
                label="少ない"
                onClick={() => setSortKey('participantsFew')}
              />
            </div>
          </div>
          <ul className="flex flex-col gap-2.5">
            {sortedActiveRooms.map((room) => (
              <li key={room.roomId}>
                <RoomRow
                  room={room}
                  configured={configured === true}
                  loading={loading}
                  payload={byId[room.roomId]}
                  viewOnly={viewOnly}
                />
              </li>
            ))}
          </ul>
          <p
            className={`mt-3 text-center text-[11px] ${
              IS_MC_PRODUCT ? 'text-gray-500' : 'text-emerald-200/50'
            }`}
          >
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
