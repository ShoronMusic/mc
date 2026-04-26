'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HOME_EXCLUDED_LIVE_ROOM_IDS } from '@/lib/home-excluded-live-room-ids';

const POLL_MS = 20_000;

type LiveRoom = {
  roomId: string;
  title: string;
  displayTitle?: string;
  hostDisplayName?: string | null;
};

type RoomPayload = {
  roomId: string;
  count: number;
};

type LiveApiResponse = {
  configured: boolean;
  rooms: LiveRoom[];
  message?: string;
};

type PresenceApiResponse = {
  configured: boolean;
  rooms: RoomPayload[];
};

/**
 * 同意ページ用: 開催中かつ在室ありの部屋を、部屋名・主催表示名・人数だけシンプルに列挙する。
 */
export function ConsentPageLiveChats() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [byId, setById] = useState<Record<string, RoomPayload>>({});
  const [message, setMessage] = useState('');

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
      const data = (await presenceRes.json()) as PresenceApiResponse;
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

  const activeRows = useMemo(() => {
    if (configured !== true) return [];
    return liveRooms
      .map((room) => {
        const payload = byId[room.roomId];
        if (!payload || payload.count <= 0) return null;
        const roomName = (room.displayTitle?.trim() || room.title).trim();
        const owner =
          typeof room.hostDisplayName === 'string' && room.hostDisplayName.trim()
            ? room.hostDisplayName.trim()
            : '—';
        return { roomId: room.roomId, roomName, owner, count: payload.count };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [configured, liveRooms, byId]);

  if (configured === false) {
    return (
      <section
        className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/25 px-3 py-2.5"
        aria-labelledby="consent-live-chats-heading"
      >
        <h2 id="consent-live-chats-heading" className="mb-1 text-center text-sm font-semibold text-amber-100">
          開催中チャット一覧
        </h2>
        <p className="text-center text-xs leading-relaxed text-amber-200/90">{message || '会の開催管理が未設定です。'}</p>
      </section>
    );
  }

  return (
    <section
      className="mb-4 rounded-lg border border-gray-600 bg-gray-900/60 px-3 py-3"
      aria-labelledby="consent-live-chats-heading"
    >
      <h2 id="consent-live-chats-heading" className="mb-2.5 text-center text-sm font-semibold text-gray-100">
        開催中チャット一覧
      </h2>
      {message && (
        <p className="mb-2 rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1.5 text-center text-[11px] text-amber-200/90">
          {message}
        </p>
      )}
      {loading && (
        <p className="text-center text-xs text-gray-500" role="status">
          読み込み中…
        </p>
      )}
      {!loading && activeRows.length === 0 && (
        <p className="text-center text-xs leading-relaxed text-gray-500">
          現在、参加者がいる開催中の部屋はありません。
        </p>
      )}
      {!loading && activeRows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {activeRows.map((row) => (
            <li
              key={row.roomId}
              className="rounded-md border border-gray-700/90 bg-gray-950/50 px-2.5 py-2 text-xs leading-snug text-gray-300"
            >
              <div className="font-medium text-gray-100">{row.roomName}</div>
              <div className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2 sm:gap-x-2">
                <div>
                  <span className="text-gray-500">チャットオーナー</span>
                  <span className="block text-gray-200">{row.owner}</span>
                </div>
                <div>
                  <span className="text-gray-500">参加人数</span>
                  <span className="block text-gray-200">{row.count} 人</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && activeRows.length > 0 && (
        <p className="mt-2 text-center text-[10px] text-gray-600">約{POLL_MS / 1000}秒ごとに更新</p>
      )}
    </section>
  );
}
