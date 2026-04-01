'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { GUEST_STORAGE_KEY } from '@/components/auth/JoinChoice';

const DEFAULT_ROOM_COUNT = 90;
const DEFAULT_ROOM_IDS = Array.from({ length: DEFAULT_ROOM_COUNT }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);

type OrganizerRoom = {
  roomId: string;
  title: string;
  isLive: boolean;
};

type LiveStatusResponse = {
  rooms?: Array<{ roomId?: string }>;
};

/**
 * ログイン済みユーザー向け: 会の開始・終了（運用・検証用の最小UI）
 */
export function MeetingStartPanel() {
  const [visible, setVisible] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [joinTitle, setJoinTitle] = useState('本日の会');
  const [newRoomId, setNewRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [newTitle, setNewTitle] = useState('本日の会');
  const [myRooms, setMyRooms] = useState<OrganizerRoom[]>([]);
  const [liveRoomIds, setLiveRoomIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(GUEST_STORAGE_KEY)) {
      setVisible(false);
      return;
    }
    const supabase = createClient();
    if (!isSupabaseConfigured() || !supabase) {
      setVisible(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const loggedIn = !!session?.user;
      setVisible(loggedIn);
      if (!loggedIn) return;
      fetch('/api/room-gatherings', { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json().catch(() => ({}))) as { rooms?: OrganizerRoom[] };
          const rooms = Array.isArray(data.rooms) ? data.rooms.filter((r) => !!r?.roomId) : [];
          setMyRooms(rooms);
          if (rooms.length > 0) {
            setJoinRoomId(rooms[0].roomId);
            if (rooms[0].title?.trim()) {
              setJoinTitle(rooms[0].title.trim());
            }
          }
        })
        .catch(() => {
          // 選択肢取得失敗時は固定候補をそのまま使う
        });

      fetch('/api/room-live-status', { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json().catch(() => ({}))) as LiveStatusResponse;
          const ids = Array.isArray(data.rooms)
            ? data.rooms
                .map((r) => (typeof r.roomId === 'string' ? r.roomId : ''))
                .filter((id): id is string => !!id)
            : [];
          setLiveRoomIds(ids);
          const firstFree = DEFAULT_ROOM_IDS.find((id) => !ids.includes(id));
          if (firstFree) {
            setNewRoomId(firstFree);
          }
        })
        .catch(() => {
          // 失敗時は既定値のまま
        });
    });
  }, []);

  const joinRoomOptions = myRooms.length > 0 ? myRooms.map((r) => r.roomId) : DEFAULT_ROOM_IDS;
  const selectedRoom = myRooms.find((r) => r.roomId === joinRoomId);
  const createRoomOptions = DEFAULT_ROOM_IDS.filter((id) => !liveRoomIds.includes(id));

  const run = useCallback(
    async (action: 'start' | 'end', payload: { roomId: string; title?: string }) => {
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch('/api/room-gatherings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action,
            roomId: payload.roomId,
            ...(action === 'start' ? { title: payload.title?.trim() || '未設定の会' } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
        if (!res.ok) {
          if (action === 'start' && res.status === 409) {
            setMessage('このルームはすでに主催中です。下の「このルームへ入る」から入室してください。');
            return;
          }
          setMessage(data?.error ?? '処理に失敗しました。');
          return;
        }
        setMessage(action === 'start' ? '会を開始しました。一覧が更新されるまで数秒お待ちください。' : '会を終了しました。');
        window.setTimeout(() => window.location.reload(), 600);
      } catch {
        setMessage('通信に失敗しました。');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!visible) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-3 sm:p-4">
        <p className="mb-3 text-center text-xs font-semibold tracking-wide text-slate-300">主催者向け（ログイン中のみ表示）</p>
        <div className="grid grid-cols-1 gap-2.5">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
            主催ルーム
            <select
              value={joinRoomId}
              onChange={(e) => {
                const nextRoomId = e.target.value;
                setJoinRoomId(nextRoomId);
                const selected = myRooms.find((r) => r.roomId === nextRoomId);
                if (selected?.title?.trim()) {
                  setJoinTitle(selected.title.trim());
                }
              }}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
              disabled={busy}
            >
              {joinRoomOptions.map((id) => {
                const mine = myRooms.find((r) => r.roomId === id);
                const label = mine ? `${id}${mine.isLive ? '（主催中）' : ''}` : id;
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
            会のタイトル
            <input
              type="text"
              value={joinTitle}
              onChange={(e) => setJoinTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
              disabled={busy}
              placeholder="例: 土曜洋楽会"
            />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={`/${encodeURIComponent(joinRoomId)}`}
            className="block w-full rounded-md border border-sky-500/50 bg-sky-900/20 px-4 py-2 text-center text-sm font-medium text-sky-200 hover:bg-sky-900/35"
          >
            このルームへ入る
          </a>
          <button
            type="button"
            onClick={() => void run('end', { roomId: joinRoomId })}
            disabled={busy}
            className="rounded-md border border-slate-500 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            このルームの会を終了
          </button>
        </div>
        {selectedRoom?.title && (
          <p className="mt-2 text-center text-[11px] text-slate-400">選択中ルームの前回タイトル: {selectedRoom.title}</p>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-emerald-600/80 bg-emerald-950/10 p-3 sm:p-4">
        <p className="mb-3 text-center text-xs font-semibold tracking-wide text-emerald-200">新規作成（空きルームのみ）</p>
        <div className="grid grid-cols-1 gap-2.5">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
            空きルーム番号
            <select
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
              className="w-full rounded-md border border-emerald-700/70 bg-slate-800 px-2.5 py-2 text-sm text-white"
              disabled={busy || createRoomOptions.length === 0}
            >
              {createRoomOptions.length === 0 && <option value="">空きルームなし</option>}
              {createRoomOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
            会のタイトル
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-emerald-700/70 bg-slate-800 px-2.5 py-2 text-sm text-white"
              disabled={busy || createRoomOptions.length === 0}
              placeholder="例: 金曜ナイト洋楽会"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void run('start', { roomId: newRoomId, title: newTitle })}
          disabled={busy || !newRoomId || createRoomOptions.length === 0}
          className="mt-3 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          会を新規作成
        </button>
      </div>
      {message && <p className="mt-2 text-center text-xs text-gray-300">{message}</p>}
    </div>
  );
}
