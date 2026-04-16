'use client';

import Link from 'next/link';
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

/** トップの主催UI用。ログイン表示名（またはメール先頭）に「の部屋」を付ける。取れなければゲスト扱い。 */
function defaultGatheringTitleFromUser(user: {
  user_metadata?: { display_name?: string; name?: string };
  email?: string;
}): string {
  const meta = user?.user_metadata;
  if (meta?.display_name && typeof meta.display_name === 'string' && meta.display_name.trim()) {
    return `${meta.display_name.trim()}の部屋`;
  }
  if (meta?.name && typeof meta.name === 'string' && meta.name.trim()) {
    return `${meta.name.trim()}の部屋`;
  }
  if (user?.email) {
    return `${user.email.split('@')[0]}の部屋`;
  }
  return 'ゲストの部屋';
}

/**
 * ログイン済みユーザー向け: 部屋での開催の開始・終了（運用・検証用の最小UI）
 */
export function MeetingStartPanel() {
  const [visible, setVisible] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [joinTitle, setJoinTitle] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [myRooms, setMyRooms] = useState<OrganizerRoom[]>([]);
  /** GET /api/room-gatherings 完了後 true（初回主催者は myRooms が空のままなので第1枠を出さない） */
  const [gatheringsLoaded, setGatheringsLoaded] = useState(false);
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
    supabase.auth.getUser().then(({ data: { user } }) => {
      const loggedIn = !!user;
      if (user) {
        const defaultTitle = defaultGatheringTitleFromUser(user);
        setNewTitle(defaultTitle);
        setJoinTitle(defaultTitle);
      }
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
          // 選択肢取得失敗時は myRooms 空のまま（第1枠は非表示、新規作成のみ）
        })
        .finally(() => {
          setGatheringsLoaded(true);
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
        })
        .catch(() => {
          // 失敗時は既定値のまま
        });
    });
  }, []);

  const selectedRoom = myRooms.find((r) => r.roomId === joinRoomId);
  const createRoomOptions = DEFAULT_ROOM_IDS.filter((id) => !liveRoomIds.includes(id));
  const liveOrganizingCount = myRooms.filter((r) => r.isLive).length;

  const run = useCallback(
    async (action: 'start' | 'end' | 'rename', payload: { roomId?: string; title?: string; autoAssign?: boolean }) => {
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
            autoAssign: payload.autoAssign === true,
            ...((action === 'start' || action === 'rename') ? { title: payload.title?.trim() || '未設定の部屋' } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
        if (!res.ok) {
          if (action === 'start' && res.status === 409) {
            setMessage(
              data?.error?.trim() ||
                'この部屋はすでに主催中です。下の「この部屋へ入る」から入室してください。',
            );
            return;
          }
          setMessage(data?.error ?? '処理に失敗しました。');
          return;
        }
        setMessage(
          action === 'start'
            ? '部屋での開催を開始しました。一覧が更新されるまで数秒お待ちください。'
            : action === 'rename'
              ? '部屋の名前を更新しました。'
              : '開催を終了しました。',
        );
        window.setTimeout(() => window.location.reload(), 600);
      } catch {
        setMessage('通信に失敗しました。');
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createNewRoom = useCallback(() => {
    const t = newTitle.trim();
    if (!t) {
      setMessage('部屋の名前を入力してください。');
      return;
    }
    void run('start', { title: t, autoAssign: true });
  }, [newTitle, run]);

  const enterRoom = useCallback(async () => {
    const selected = myRooms.find((r) => r.roomId === joinRoomId);
    const before = selected?.title?.trim() ?? '';
    const after = joinTitle.trim();
    if (after && before !== after) {
      try {
        setMessage(null);
        setBusy(true);
        const res = await fetch('/api/room-gatherings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'rename',
            roomId: joinRoomId,
            title: after,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setMessage(data?.error ?? '名前の更新に失敗しました。');
        }
      } catch {
        setMessage('名前の更新に失敗しました。');
      } finally {
        setBusy(false);
      }
    }
    window.location.href = `/${encodeURIComponent(joinRoomId)}`;
  }, [joinRoomId, joinTitle, myRooms]);

  if (!visible) return null;

  /** 主催履歴があるときだけ「再入室・終了」枠を出す（履歴ゼロ時は全室プルダウンになるが、入室は開催中の会が必要で誤解を招く） */
  const showReturningOrganizerBlock = gatheringsLoaded && myRooms.length > 0;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {showReturningOrganizerBlock ? (
        <div className="rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-3 sm:p-4">
          <div className="mb-3 space-y-1 text-center">
            <p className="text-sm font-semibold text-slate-100">主催者メニュー</p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              操作する部屋を下のカードから選びます。
              <span className="text-emerald-300/90"> 緑「主催中」</span>
              はいま会が開いている部屋、
              <span className="text-slate-500"> 灰「終了済」</span>
              は過去に主催した部屋（再開・終了用）です。
            </p>
            {liveOrganizingCount > 0 && (
              <p className="rounded-md border border-emerald-800/50 bg-emerald-950/40 px-2 py-1.5 text-[11px] font-medium text-emerald-200/95">
                いま主催中の会：{liveOrganizingCount} 部屋（同時は最大2まで）
              </p>
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">
              補足：同時主催は最大2部屋です。例として、1つは個人で使う専用・もう1つは招待用のオープンルーム、と分けると整理しやすいです（
              <Link href="/guide/service" className="text-sky-400/90 underline-offset-2 hover:underline">
                ご利用上の注意・サービス全般
              </Link>
              ）。
            </p>
            <p className="text-[10px] leading-relaxed text-slate-500">
              全員が退室しても会はすぐには終わりません。「この部屋の開催を終了」を押すか、在室ゼロが約30分続くと自動終了します。詳しくは
              <Link href="/guide/service" className="text-sky-400/90 underline-offset-2 hover:underline">
                サービス全般
              </Link>
              を参照してください。
            </p>
          </div>
          <p className="mb-2 text-xs font-medium text-slate-400">主催する部屋を選択</p>
          <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
            {myRooms.map((r) => {
              const selected = joinRoomId === r.roomId;
              return (
                <li key={r.roomId}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={selected}
                    onClick={() => {
                      setJoinRoomId(r.roomId);
                      if (r.title?.trim()) setJoinTitle(r.title.trim());
                    }}
                    className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-sky-500 bg-sky-950/50 ring-2 ring-sky-500/60'
                        : 'border-slate-600 bg-slate-800/80 hover:border-slate-500'
                    } ${r.isLive ? 'border-l-4 border-l-emerald-500' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium text-white">部屋 {r.roomId}</span>
                      {r.isLive ? (
                        <span className="shrink-0 rounded-full bg-emerald-600/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                          主催中
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                          終了済
                        </span>
                      )}
                    </div>
                    <span className="line-clamp-2 text-xs text-slate-300">{r.title}</span>
                    {selected && (
                      <span className="text-[10px] font-medium text-sky-300">選択中 · 下のボタンで入室・終了</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-1 gap-2.5">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
              部屋の名前
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
            <button
              type="button"
              onClick={() => void enterRoom()}
              disabled={busy}
              className="block w-full rounded-md border border-sky-500/50 bg-sky-900/20 px-4 py-2 text-center text-sm font-medium text-sky-200 hover:bg-sky-900/35"
            >
              この部屋へ入る
            </button>
            <button
              type="button"
              onClick={() => void run('end', { roomId: joinRoomId })}
              disabled={busy}
              className="rounded-md border border-slate-500 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            >
              この部屋の開催を終了
            </button>
          </div>
          {selectedRoom?.title && (
            <p className="mt-2 text-center text-[11px] text-slate-400">選択中の部屋の前回の名前: {selectedRoom.title}</p>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-dashed border-emerald-600/80 bg-emerald-950/10 p-3 sm:p-4">
        <p className="mb-3 text-center text-xs font-semibold tracking-wide text-emerald-200">新規作成（空きの部屋の自動割当）</p>
        <form
          className="grid grid-cols-1 gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            createNewRoom();
          }}
        >
          <p className="rounded-md border border-emerald-700/50 bg-slate-900/40 px-3 py-2 text-center text-xs text-emerald-100">
            割当予定の部屋: {createRoomOptions[0] ?? '空きの部屋なし'}
          </p>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-300">
            部屋の名前（必須）
            <input
              type="text"
              name="newGatheringTitle"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={120}
              required
              autoComplete="off"
              className="w-full rounded-md border border-emerald-700/70 bg-slate-800 px-2.5 py-2 text-sm text-white"
              disabled={busy || createRoomOptions.length === 0}
              placeholder="あなたの表示名の部屋（初期値・編集可）"
            />
          </label>
          <button
            type="submit"
            disabled={busy || createRoomOptions.length === 0}
            className="mt-1 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            部屋を新規作成
          </button>
        </form>
      </div>
      {message && <p className="mt-2 text-center text-xs text-gray-300">{message}</p>}
    </div>
  );
}
