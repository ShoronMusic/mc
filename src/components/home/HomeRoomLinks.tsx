'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

const DEFAULT_ROOM_IDS = ['01', '02', '03'] as const;
const POLL_MS = 20_000;
const NAME_PREVIEW_MAX = 8;

type RoomPayload = { roomId: string; count: number; names: string[]; error?: boolean };

type ApiResponse = {
  configured: boolean;
  rooms: RoomPayload[];
};

function formatNameLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= NAME_PREVIEW_MAX) return names.join('、');
  return `${names.slice(0, NAME_PREVIEW_MAX).join('、')} …他${names.length - NAME_PREVIEW_MAX}名`;
}

function RoomRow({
  roomId,
  configured,
  loading,
  payload,
}: {
  roomId: string;
  configured: boolean;
  loading: boolean;
  payload: RoomPayload | undefined;
}) {
  const label = `${roomId} ルームに入る`;

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

  return (
    <Link
      href={`/${roomId}`}
      className="flex flex-col gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white transition hover:bg-gray-700"
    >
      <span className="text-center font-medium">{label}</span>
      {sub && <span className="text-center text-xs leading-snug break-words">{sub}</span>}
    </Link>
  );
}

export function HomeRoomLinks() {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [byId, setById] = useState<Record<string, RoomPayload>>({});

  const load = useCallback(async () => {
    const ids = DEFAULT_ROOM_IDS.join(',');
    try {
      const res = await fetch(`/api/room-presence?rooms=${encodeURIComponent(ids)}`);
      const data = (await res.json()) as ApiResponse;
      if (!data.configured) {
        setConfigured(false);
        setById({});
        return;
      }
      setConfigured(true);
      const next: Record<string, RoomPayload> = {};
      for (const r of data.rooms ?? []) {
        next[r.roomId] = r;
      }
      setById(next);
    } catch {
      setConfigured(true);
      const err: Record<string, RoomPayload> = {};
      for (const id of DEFAULT_ROOM_IDS) {
        err[id] = { roomId: id, count: 0, names: [], error: true };
      }
      setById(err);
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
      {DEFAULT_ROOM_IDS.map((id) => (
        <RoomRow key={id} roomId={id} configured={configured} loading={loading} payload={byId[id]} />
      ))}
      {configured && (
        <p className="text-center text-[11px] text-gray-600">参加状況は約{POLL_MS / 1000}秒ごとに更新されます</p>
      )}
    </div>
  );
}
