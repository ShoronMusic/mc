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

/**
 * ログイン済みユーザー向け: 会の開始・終了（運用・検証用の最小UI）
 */
export function MeetingStartPanel() {
  const [visible, setVisible] = useState(false);
  const [roomId, setRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [title, setTitle] = useState('本日の会');
  const [myRooms, setMyRooms] = useState<OrganizerRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [customRoomId, setCustomRoomId] = useState('');

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
            setRoomId(rooms[0].roomId);
            if (rooms[0].title?.trim()) {
              setTitle(rooms[0].title.trim());
            }
          }
        })
        .catch(() => {
          // 選択肢取得失敗時は固定候補をそのまま使う
        });
    });
  }, []);

  const roomOptions = myRooms.length > 0 ? myRooms.map((r) => r.roomId) : DEFAULT_ROOM_IDS;
  const selectedRoom = myRooms.find((r) => r.roomId === roomId);
  const alreadyLive = !!selectedRoom?.isLive;

  const run = useCallback(
    async (action: 'start' | 'end') => {
      setMessage(null);
      setBusy(true);
      try {
        const res = await fetch('/api/room-gatherings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action,
            roomId,
            ...(action === 'start' ? { title: title.trim() || '未設定の会' } : {}),
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
    [roomId, title],
  );

  if (!visible) return null;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-3 sm:p-4">
      <p className="mb-3 text-center text-xs font-semibold tracking-wide text-slate-300">主催者向け（ログイン中のみ表示）</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
          ルーム
          <select
            value={roomId}
            onChange={(e) => {
              const nextRoomId = e.target.value;
              setRoomId(nextRoomId);
              const selected = myRooms.find((r) => r.roomId === nextRoomId);
              if (selected?.title?.trim()) {
                setTitle(selected.title.trim());
              }
            }}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
            disabled={busy}
          >
            {roomOptions.map((id) => {
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
          別のルームID（任意）
          <input
            type="text"
            value={customRoomId}
            onChange={(e) => setCustomRoomId(e.target.value)}
            onBlur={() => {
              const next = customRoomId.trim();
              if (next) setRoomId(next);
            }}
            maxLength={48}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
            disabled={busy}
            placeholder="例: 91 / my-room"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
          会のタイトル
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
            disabled={busy}
            placeholder="例: 土曜洋楽会"
          />
        </label>
      </div>
      {selectedRoom?.title && (
        <p className="mt-2 text-center text-[11px] text-slate-400">選択中ルームの前回タイトル: {selectedRoom.title}</p>
      )}
      {myRooms.length > 0 && (
        <p className="mt-2 text-center text-[11px] text-slate-500">
          あなたが過去に主催したルームを優先表示しています。
        </p>
      )}
      {myRooms.length === 0 && (
        <p className="mt-2 text-center text-[11px] text-slate-500">
          過去の主催履歴がないため、既定ルーム候補を表示しています。
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void run('start')}
          disabled={busy || alreadyLive}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          title={alreadyLive ? 'このルームはすでに主催中です' : 'このルームで新しく会を開始します'}
        >
          新しく会を開始
        </button>
        <button
          type="button"
          onClick={() => void run('end')}
          disabled={busy}
          className="rounded-md border border-slate-500 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          このルームの会を終了
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        「新しく会を開始」は未主催のときに使います。すでに主催中なら「このルームへ入る」を使ってください。
      </p>
      {alreadyLive && (
        <p className="mt-1 text-center text-xs text-emerald-300">このルームは現在 主催中です。開始せずそのまま入室できます。</p>
      )}
      <div className="mt-2">
        <a
          href={`/${encodeURIComponent(roomId)}`}
          className="block w-full rounded-md border border-sky-500/50 bg-sky-900/20 px-4 py-2 text-center text-sm font-medium text-sky-200 hover:bg-sky-900/35"
        >
          このルームへ入る
        </a>
      </div>
      {message && <p className="mt-2 text-center text-xs text-gray-300">{message}</p>}
    </div>
  );
}
