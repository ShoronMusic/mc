'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { loadBrowserSupabaseClient } from '@/lib/supabase/load-browser-client';
import { startRoomGatheringClient } from '@/lib/start-room-gathering-client';
import { hasGuestRoomPersistence } from '@/lib/guest-room-persistence';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import { useTopPageLoggedIn } from '@/components/home/use-top-page-auth';

const DEFAULT_ROOM_COUNT = 90;
const MAX_LIVE_GATHERINGS_PER_USER = 2;
const DEFAULT_ROOM_IDS = Array.from({ length: DEFAULT_ROOM_COUNT }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);

type OrganizerRoom = {
  roomId: string;
  title: string;
  isLive: boolean;
  lastStartedAt?: string | null;
};

type LiveStatusResponse = {
  rooms?: Array<{ roomId?: string }>;
};

function preferLiveOrganizerRoom(rooms: OrganizerRoom[]): OrganizerRoom | undefined {
  return rooms.find((r) => r.isLive) ?? rooms[0];
}

function orderOrganizerRooms(rooms: OrganizerRoom[]): OrganizerRoom[] {
  return [...rooms].sort((a, b) => Number(b.isLive) - Number(a.isLive));
}

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

function GatheringsLoadingCard() {
  return (
    <div
      className="rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-4 sm:p-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-center text-sm font-medium text-slate-100">
        開催実績のある部屋を読み込んでいます…
      </p>
      <p className="mt-1.5 text-center text-[11px] leading-relaxed text-slate-400">
        過去に主催した部屋がある場合、ここに主催者メニューが表示されます。しばらくお待ちください。
      </p>
      <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/90">
        <div
          className={`absolute inset-y-0 left-0 w-2/5 rounded-full motion-safe:animate-[gatherings-load-bar_1.4s_ease-in-out_infinite] ${
            IS_MC_PRODUCT ? 'bg-gray-400' : 'bg-sky-500/90'
          }`}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** 部屋名入力（鉛筆アイコンで編集可であることを示す） */
function RoomNameEditableField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  inputClassName,
  required = false,
  name,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName: string;
  required?: boolean;
  name?: string;
  autoComplete?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs text-slate-400">
      <label htmlFor={inputId} className="inline-flex items-center gap-1.5">
        <span>{label}</span>
        <span
          className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${
            IS_MC_PRODUCT
              ? 'bg-gray-200 text-gray-700'
              : 'bg-slate-700/80 text-sky-200/90'
          }`}
        >
          <PencilSquareIcon className="h-3 w-3" aria-hidden />
          編集可
        </span>
      </label>
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          required={required}
          autoComplete={autoComplete}
          className={`${inputClassName} pr-9`}
          disabled={disabled}
          placeholder={placeholder}
          aria-description="タップまたはクリックして部屋の名前を編集できます"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="部屋の名前を編集"
          title="部屋の名前を編集"
          onClick={() => {
            const el = inputRef.current;
            if (!el || disabled) return;
            el.focus();
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }}
          className={`absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md disabled:opacity-40 ${
            IS_MC_PRODUCT
              ? 'text-gray-500 hover:text-gray-800'
              : 'text-sky-300/80 hover:text-sky-100'
          }`}
        >
          <PencilSquareIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * ログイン済みユーザー向け: 部屋での開催の開始・終了（運用・検証用の最小UI）
 */
export function MeetingStartPanel() {
  const isLoggedIn = useTopPageLoggedIn();
  const authChecked = isLoggedIn !== null;
  const visible = isLoggedIn === true;
  const [joinRoomId, setJoinRoomId] = useState<string>(DEFAULT_ROOM_IDS[0]);
  const [joinTitle, setJoinTitle] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [myRooms, setMyRooms] = useState<OrganizerRoom[]>([]);
  /** GET /api/room-gatherings 完了後 true（初回主催者は myRooms が空のままなので第1枠を出さない） */
  const [gatheringsLoaded, setGatheringsLoaded] = useState(false);
  const [liveRoomIds, setLiveRoomIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [defaultTitleReady, setDefaultTitleReady] = useState(false);

  useEffect(() => {
    if (!visible || defaultTitleReady) return;
    if (typeof window === 'undefined') return;
    if (hasGuestRoomPersistence()) return;
    void loadBrowserSupabaseClient().then(({ client, configured }) => {
      if (!configured || !client) return;
      void client.auth.getSession().then(({ data }) => {
        const user = data.session?.user;
        if (user) {
          setJoinTitle(defaultGatheringTitleFromUser(user));
          setNewTitle('');
        }
        setDefaultTitleReady(true);
      });
    });
  }, [visible, defaultTitleReady]);

  useEffect(() => {
    if (!visible) {
      setGatheringsLoaded(false);
      setMyRooms([]);
      return;
    }
    let cancelled = false;
    setGatheringsLoaded(false);

    fetch('/api/room-gatherings', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json().catch(() => ({}))) as { rooms?: OrganizerRoom[] };
        if (cancelled) return;
        const rooms = Array.isArray(data.rooms) ? data.rooms.filter((r) => !!r?.roomId) : [];
        setMyRooms(rooms);
        if (rooms.length > 0) {
          const preferred = preferLiveOrganizerRoom(rooms);
          if (preferred) {
            setJoinRoomId(preferred.roomId);
            if (preferred.title?.trim()) {
              setJoinTitle(preferred.title.trim());
            }
          }
        }
      })
      .catch(() => {
        // 選択肢取得失敗時は myRooms 空のまま（第1枠は非表示、新規作成のみ）
      })
      .finally(() => {
        if (!cancelled) setGatheringsLoaded(true);
      });

    // 空き部屋判定のみ必要。host 名解決などを省略する lite で API を軽くする
    // gatherings と競合しにくいよう少し遅らせる
    const liveTimer = window.setTimeout(() => {
      fetch('/api/room-live-status?lite=1', { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok || cancelled) return;
          const data = (await res.json().catch(() => ({}))) as LiveStatusResponse;
          if (cancelled) return;
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
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(liveTimer);
    };
  }, [visible]);

  const selectedRoom = myRooms.find((r) => r.roomId === joinRoomId);
  const orderedRooms = orderOrganizerRooms(myRooms);
  const createRoomOptions = DEFAULT_ROOM_IDS.filter((id) => !liveRoomIds.includes(id));
  const liveOrganizingCount = myRooms.filter((r) => r.isLive).length;
  const isSingleOrganizerRoom = myRooms.length === 1;
  const soleOrganizerRoom = isSingleOrganizerRoom ? myRooms[0] : null;

  const liveElapsedDaysLabel = useCallback((startedAt?: string | null): string | null => {
    if (!startedAt) return null;
    const started = new Date(startedAt);
    const ms = started.getTime();
    if (!Number.isFinite(ms)) return null;
    const diff = Date.now() - ms;
    if (diff < 0) return '開催1日目';
    const days = Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
    return `開催${days}日目`;
  }, []);

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
    const titleForSession = after || before || '未設定の部屋';

    setMessage(null);
    setBusy(true);
    try {
      if (selected?.isLive && after && before !== after) {
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
          return;
        }
      }

      if (selected && !selected.isLive) {
        const started = await startRoomGatheringClient(joinRoomId, titleForSession);
        if (!started.ok) {
          setMessage(started.error);
          return;
        }
      }

      window.location.href = `/${encodeURIComponent(joinRoomId)}`;
    } catch {
      setMessage('通信に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [joinRoomId, joinTitle, myRooms]);

  if (!authChecked) {
    return (
      <div className="mt-4">
        <GatheringsLoadingCard />
      </div>
    );
  }

  if (!visible) return null;

  /** 主催履歴があるときだけ「再入室・終了」枠を出す（履歴ゼロ時は全室プルダウンになるが、入室は開催中の会が必要で誤解を招く） */
  const showReturningOrganizerBlock = gatheringsLoaded && myRooms.length > 0;
  const showGatheringsLoading = !gatheringsLoaded;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {showGatheringsLoading ? <GatheringsLoadingCard /> : null}
      {showReturningOrganizerBlock ? (
        <div className="rounded-xl border border-dashed border-slate-600/90 bg-slate-900/60 p-3 sm:p-4">
          <div className="mb-3 space-y-1 text-center">
            <p className="text-sm font-semibold text-slate-100">主催者メニュー</p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {isSingleOrganizerRoom ? (
                <>
                  この部屋を管理できます（名前変更・入室・終了）。
                  {soleOrganizerRoom?.isLive ? (
                    <span className="text-emerald-300/90"> 開催中</span>
                  ) : (
                    <span className="text-slate-500"> 終了済み</span>
                  )}
                </>
              ) : (
                <>
                  操作する部屋を下のカードから選びます。
                  <span className="text-emerald-300/90"> 緑「主催中」</span>
                  はいま会が開いている部屋、
                  <span className="text-slate-500"> 灰「終了済」</span>
                  は過去に主催した部屋（再開・終了用）です。
                </>
              )}
            </p>
            {liveOrganizingCount > 0 && (
              <p
                className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                  IS_MC_PRODUCT
                    ? 'mc-panel-muted border-gray-300'
                    : 'border-emerald-800/50 bg-emerald-950/40 text-emerald-200/95'
                }`}
              >
                主催中: {liveOrganizingCount} / {MAX_LIVE_GATHERINGS_PER_USER} 部屋
              </p>
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">
              補足：同時主催は最大2部屋です。例として、1つは個人で使う専用・もう1つは招待用のオープンルーム、と分けると整理しやすいです（
              <Link href="/guide/service" className={IS_MC_PRODUCT ? 'text-gray-600 underline-offset-2 hover:underline' : 'text-sky-400/90 underline-offset-2 hover:underline'}>
                ご利用上の注意・サービス全般
              </Link>
              ）。
            </p>
            <p className="text-[10px] leading-relaxed text-slate-500">
              全員が退室しても会はすぐには終わりません。「この部屋の開催を終了」を押すか、在室ゼロが約30分続くと自動終了します。詳しくは
              <Link href="/guide/service" className={IS_MC_PRODUCT ? 'text-gray-600 underline-offset-2 hover:underline' : 'text-sky-400/90 underline-offset-2 hover:underline'}>
                サービス全般
              </Link>
              を参照してください。
            </p>
          </div>
          {isSingleOrganizerRoom && soleOrganizerRoom ? (
            <div
              className={`rounded-lg border bg-slate-800/70 p-3 sm:p-4 ${
                soleOrganizerRoom.isLive
                  ? IS_MC_PRODUCT
                    ? 'mc-accent-selected border-gray-300 ring-2'
                    : 'border-sky-500/55 ring-2 ring-sky-500/45'
                  : 'border-slate-600'
              } ${soleOrganizerRoom.isLive ? (IS_MC_PRODUCT ? 'border-l-4 mc-accent-live-bar' : 'border-l-4 border-l-emerald-500') : ''}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-white">
                  部屋 {soleOrganizerRoom.roomId}
                </span>
                {soleOrganizerRoom.isLive ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      IS_MC_PRODUCT ? 'mc-accent-badge' : 'bg-emerald-600/35 text-emerald-200'
                    }`}>
                      主催中
                    </span>
                    {liveElapsedDaysLabel(soleOrganizerRoom.lastStartedAt) ? (
                      <span className="text-[10px] font-medium text-emerald-200/90">
                        {liveElapsedDaysLabel(soleOrganizerRoom.lastStartedAt)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                    終了済
                  </span>
                )}
              </div>
              <RoomNameEditableField
                label="部屋の名前"
                value={joinTitle}
                onChange={setJoinTitle}
                disabled={busy}
                placeholder="例: 土曜洋楽会"
                inputClassName="w-full rounded-md border border-slate-600 bg-slate-900 px-2.5 py-2 text-sm text-white"
              />
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => void enterRoom()}
                  disabled={busy}
                  className={`block w-full rounded-md border px-4 py-3 text-center text-sm font-bold shadow-md transition disabled:opacity-50 ${
                    IS_MC_PRODUCT
                      ? 'mc-accent-primary'
                      : soleOrganizerRoom.isLive
                        ? 'border-emerald-300 bg-emerald-600 text-white shadow-emerald-950/50 ring-2 ring-emerald-400/60 hover:bg-emerald-500'
                        : 'border-sky-400/70 bg-sky-600 text-white shadow-sky-950/40 ring-2 ring-sky-400/45 hover:bg-sky-500'
                  }`}
                >
                  {soleOrganizerRoom.isLive ? 'この部屋へ入る' : '終了済みを再開して入室'}
                </button>
                <button
                  type="button"
                  onClick={() => void run('end', { roomId: joinRoomId })}
                  disabled={busy || !soleOrganizerRoom.isLive}
                  className="rounded-md border border-slate-500 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  開催を終了
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-slate-400">主催する部屋を選択</p>
              <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="list">
                {orderedRooms.map((r) => {
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
                            ? IS_MC_PRODUCT
                              ? 'mc-accent-selected ring-2'
                              : 'border-sky-500 bg-sky-950/50 ring-2 ring-sky-500/60'
                            : 'border-slate-600 bg-slate-800/80 hover:border-slate-500'
                        } ${r.isLive ? (IS_MC_PRODUCT ? 'border-l-4 mc-accent-live-bar' : 'border-l-4 border-l-emerald-500') : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-medium text-white">部屋 {r.roomId}</span>
                          {r.isLive ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      IS_MC_PRODUCT ? 'mc-accent-badge' : 'bg-emerald-600/35 text-emerald-200'
                    }`}>
                                主催中
                              </span>
                              {liveElapsedDaysLabel(r.lastStartedAt) ? (
                                <span className="text-[10px] font-medium text-emerald-200/90">
                                  {liveElapsedDaysLabel(r.lastStartedAt)}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                              終了済
                            </span>
                          )}
                        </div>
                        <span className="line-clamp-2 text-xs text-slate-300">{r.title}</span>
                        {selected && (
                          <span className={`text-[10px] font-medium ${IS_MC_PRODUCT ? 'text-green-800' : 'text-sky-300'}`}>
                            選択中 · 下のボタンで入室・終了
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-1 gap-2.5">
                <RoomNameEditableField
                  label="部屋の名前"
                  value={joinTitle}
                  onChange={setJoinTitle}
                  disabled={busy}
                  placeholder="例: 土曜洋楽会"
                  inputClassName="w-full rounded-md border border-slate-600 bg-slate-800 px-2.5 py-2 text-sm text-white"
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => void enterRoom()}
                  disabled={busy}
                  className={`block w-full rounded-md border px-4 py-3 text-center text-sm font-bold shadow-md transition disabled:opacity-50 ${
                    IS_MC_PRODUCT
                      ? 'mc-accent-primary'
                      : selectedRoom?.isLive
                        ? 'border-emerald-300 bg-emerald-600 text-white shadow-emerald-950/50 ring-2 ring-emerald-400/60 hover:bg-emerald-500'
                        : 'border-sky-400/70 bg-sky-600 text-white shadow-sky-950/40 ring-2 ring-sky-400/45 hover:bg-sky-500'
                  }`}
                >
                  {selectedRoom?.isLive ? 'この部屋へ入る' : '終了済みを再開して入室'}
                </button>
                <button
                  type="button"
                  onClick={() => void run('end', { roomId: joinRoomId })}
                  disabled={busy || !selectedRoom?.isLive}
                  className="rounded-md border border-slate-500 bg-slate-800 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  この部屋の開催を終了
                </button>
              </div>
              {selectedRoom?.title && selectedRoom.title.trim() !== joinTitle.trim() ? (
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  保存済みの名前: {selectedRoom.title}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div
        className={`rounded-xl border border-dashed p-3 sm:p-4 ${
          IS_MC_PRODUCT ? 'border-gray-400 bg-gray-50' : 'border-emerald-600/80 bg-emerald-950/10'
        }`}
      >
        <p
          className={`mb-3 text-center text-xs font-semibold tracking-wide ${
            IS_MC_PRODUCT ? 'text-gray-700' : 'text-emerald-200'
          }`}
        >
          新規作成（空きの部屋の自動割当）
        </p>
        <form
          className="grid grid-cols-1 gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            createNewRoom();
          }}
        >
          <p
            className={`rounded-md border px-3 py-2 text-center text-xs ${
              IS_MC_PRODUCT
                ? 'mc-panel-muted border-gray-300'
                : 'border-emerald-700/50 bg-slate-900/40 text-emerald-100'
            }`}
          >
            割当予定の部屋: {createRoomOptions[0] ?? '空きの部屋なし'}
          </p>
          <RoomNameEditableField
            label="部屋の名前（必須）"
            value={newTitle}
            onChange={setNewTitle}
            disabled={busy || createRoomOptions.length === 0}
            placeholder="例: 土曜洋楽会"
            required
            name="newGatheringTitle"
            autoComplete="off"
            inputClassName={`w-full rounded-md border px-2.5 py-2 text-sm ${
              IS_MC_PRODUCT
                ? 'border-gray-300 bg-white text-gray-900'
                : 'border-emerald-700/70 bg-slate-800 text-white'
            }`}
          />
          <button
            type="submit"
            disabled={busy || createRoomOptions.length === 0}
            className={`mt-1 w-full rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              IS_MC_PRODUCT
                ? 'mc-accent-primary'
                : 'border-emerald-700/70 bg-slate-800 text-emerald-200 hover:bg-slate-700'
            }`}
          >
            部屋を新規作成
          </button>
        </form>
      </div>
      {message && <p className="mt-2 text-center text-xs text-gray-300">{message}</p>}
    </div>
  );
}
