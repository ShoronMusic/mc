'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getOrCreateRoomClientId } from '@/lib/room-owner';
import type { User } from '@supabase/supabase-js';
import {
  CHAT_TEXT_COLOR_PALETTE,
  DEFAULT_CHAT_TEXT_COLOR,
} from '@/lib/chat-text-color';
import {
  ROOM_DISPLAY_TITLE_MAX_CHARS,
  ROOM_LOBBY_MESSAGE_MAX_CHARS,
  countLobbyMessageChars,
} from '@/lib/room-lobby-message';
import {
  type CommentPackSlotSelection,
  COMMENT_PACK_SLOTS_FULL,
  COMMENT_PACK_SLOTS_NONE,
  DEFAULT_COMMENT_PACK_SLOTS,
  toggleCommentPackSlot,
} from '@/lib/comment-pack-slots';
import { assignDefaultGuestDisplayName } from '@/lib/guest-display-name';
import {
  readJoinEntryChimeEnabled,
  writeJoinEntryChimeEnabled,
} from '@/lib/participant-join-announcements-preference';
import { USER_SONG_HISTORY_UPDATED_EVENT } from '@/lib/user-song-history-events';
import { suggestMyListArtistTitleFromYoutubeStyle } from '@/lib/my-list-youtube-title-suggest';
import { MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT } from '@/lib/musicai-extension-events';
import MainArtistTabPanel from '@/components/room/MainArtistTabPanel';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import { SONG_ERA_OPTIONS } from '@/lib/song-era-options';

const MY_LIST_LIB_INDEX_HASH = '#';
const MY_LIST_LIB_INDEX_OTHER = 'その他';
const MY_LIST_NEW_SONGS_PAGE_SIZE = 10;
const MUSIC_HISTORY_PAGE_SIZE = 10;
const MY_PAGE_STYLE_TEXT_COLORS: Record<string, string> = {
  Rock: '#6246ea',
  Pop: '#f25042',
  Dance: '#f39800',
  'Alternative rock': '#448aca',
  Electronica: '#ffd803',
  'R&B': '#8c7851',
  'Hip-hop': '#078080',
  Metal: '#9646ea',
  Other: '#BDBDBD',
  Others: '#BDBDBD',
  Jazz: '#BDBDBD',
};
const MY_PAGE_ERA_TEXT_COLORS: Record<string, string> = {
  'Pre-50s': '#9e9e9e',
  '50s': '#a1887f',
  '60s': '#90caf9',
  '70s': '#81c784',
  '80s': '#ffab91',
  '90s': '#ce93d8',
  '00s': '#fff176',
  '10s': '#80deea',
  '20s': '#aed581',
  Other: '#9e9e9e',
};

function getMyPageStyleTextColor(style: string | null | undefined): string | undefined {
  if (!style || !style.trim()) return undefined;
  return MY_PAGE_STYLE_TEXT_COLORS[style] ?? MY_PAGE_STYLE_TEXT_COLORS[style.trim()];
}

function getMyPageEraTextColor(era: string | null | undefined): string | undefined {
  if (!era || !era.trim()) return undefined;
  return MY_PAGE_ERA_TEXT_COLORS[era] ?? '#b0bec5';
}

function participationSlotStartMs(t: Date): number {
  const y = t.getFullYear();
  const m = t.getMonth();
  const d = t.getDate();
  const h = t.getHours();
  if (h >= 6 && h < 18) return new Date(y, m, d, 6, 0, 0, 0).getTime();
  if (h >= 18) return new Date(y, m, d, 18, 0, 0, 0).getTime();
  return new Date(y, m, d - 1, 18, 0, 0, 0).getTime();
}

function formatParticipationSlotLabel(startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const y = s.getFullYear();
  const m = String(s.getMonth() + 1).padStart(2, '0');
  const d = String(s.getDate()).padStart(2, '0');
  const sh = String(s.getHours()).padStart(2, '0');
  const eh = String(e.getHours()).padStart(2, '0');
  if (s.getHours() === 18) {
    const ny = e.getFullYear();
    const nm = String(e.getMonth() + 1).padStart(2, '0');
    const nd = String(e.getDate()).padStart(2, '0');
    return `${y}/${m}/${d} ${sh}:00 - ${ny}/${nm}/${nd} ${eh}:00`;
  }
  return `${y}/${m}/${d} ${sh}:00 - ${eh}:00`;
}

function formatDurationJa(totalMs: number): string {
  const sec = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function buildArtistSlugForProfile(displayName: string): string | null {
  let s = displayName.trim();
  if (!s) return null;
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/^the\s+/i, '');
  s = s.toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/['’]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || null;
}

function myListLibraryArtistNameForIndexing(displayName: string): string {
  const t = displayName.trim();
  const m = /^the\s+/i.exec(t);
  if (m) return t.slice(m[0].length).trimStart();
  return t;
}

function myListLibraryArtistIndexKey(displayName: string): string {
  const t = myListLibraryArtistNameForIndexing(displayName);
  if (!t) return MY_LIST_LIB_INDEX_OTHER;
  const c0 = t[0];
  if (c0 >= 'A' && c0 <= 'Z') return c0;
  if (c0 >= 'a' && c0 <= 'z') return c0.toUpperCase();
  if (c0 >= '0' && c0 <= '9') return MY_LIST_LIB_INDEX_HASH;
  return MY_LIST_LIB_INDEX_OTHER;
}

function buildMyListNewSongsPaginationItems(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: Array<number | 'ellipsis'> = [1];
  const pushEllipsis = () => {
    if (items[items.length - 1] !== 'ellipsis') items.push('ellipsis');
  };
  if (current <= 3) {
    for (let p = 2; p <= Math.min(5, total - 1); p++) items.push(p);
    pushEllipsis();
  } else if (current >= total - 2) {
    pushEllipsis();
    for (let p = Math.max(2, total - 4); p < total; p++) items.push(p);
  } else {
    pushEllipsis();
    items.push(current - 1, current, current + 1);
    pushEllipsis();
  }
  items.push(total);
  return items;
}

function getDisplayName(user: User | null): string {
  if (!user) return '';
  const meta = user.user_metadata;
  if (meta?.display_name && typeof meta.display_name === 'string') return meta.display_name;
  if (meta?.name && typeof meta.name === 'string') return meta.name;
  if (user.email) return user.email.split('@')[0];
  return 'ユーザー';
}

/** ファイル名用（Windows 等で使えない文字を置換） */
function sanitizeForFilename(name: string): string {
  const t = name.replace(/[/\\:*?"<>|\r\n\t]/g, '_').trim();
  return t.slice(0, 80) || 'ユーザー';
}

/** 例: 20260320 */
function formatDateYmdForFilename(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function downloadUtf8TextFile(filename: string, text: string) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface SongHistoryRow {
  id: string;
  room_id: string;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  posted_at: string;
  /** 同期部屋の選曲ラウンド（列未追加のDBでは undefined） */
  selection_round?: number | null;
  style?: string | null;
  era?: string | null;
}
interface ParticipationHistoryRow {
  id: string;
  room_id: string;
  gathering_id: string | null;
  gathering_title: string | null;
  display_name: string | null;
  joined_at: string;
  left_at: string | null;
}

interface ParticipationSummaryRow {
  slotStartMs: number;
  slotEndMs: number;
  slotLabel: string;
  room_id: string;
  gathering_title: string | null;
  display_name: string | null;
  first_joined_ms: number;
  last_left_ms: number | null;
  hasOpenSession: boolean;
  total_stay_ms: number;
}

interface FavoriteRow {
  id: string;
  video_id: string;
  display_name: string;
  played_at: string;
  title: string | null;
  artist_name: string | null;
  style?: string | null;
  era?: string | null;
}

interface MyListItemRow {
  id: string;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  style?: string | null;
  era?: string | null;
  note: string | null;
  source: string;
  music8_song_id: number | null;
  created_at: string;
  updated_at: string;
}

interface MyListLibraryArtistItemRow {
  id: string;
  title: string | null;
  artist: string | null;
  video_id: string;
  url: string;
  position: number;
  created_at: string;
}

interface MyListLibraryArtistRow {
  id: string;
  display_name: string;
  artist_slug: string | null;
  linked_count: number;
  items: MyListLibraryArtistItemRow[];
}

export interface ParticipantForTransfer {
  clientId: string;
  displayName: string;
}

const LOBBY_SAVE_FETCH_MS = 25_000;
/** 一部環境で res.json() / body 読み取りだけが終わらない事例への上限 */
const LOBBY_RESPONSE_BODY_MS = 8_000;

function LobbyMessageOwnerBlock({
  roomId,
  clientId,
  onSaved,
}: {
  roomId: string;
  clientId: string;
  onSaved?: (payload: { displayTitle: string; message: string }) => void;
}) {
  const [titleValue, setTitleValue] = useState('');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [lobbyRes, liveRes] = await Promise.all([
          fetch(`/api/room-lobby-message?roomId=${encodeURIComponent(roomId)}`),
          fetch(`/api/room-live-status?roomId=${encodeURIComponent(roomId)}`),
        ]);
        if (!cancelled) setLoading(false);
        if (cancelled) return;
        let message = '';
        let displayTitle = '';
        let liveTitle = '';
        try {
          const text = await Promise.race([
            lobbyRes.text(),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), LOBBY_RESPONSE_BODY_MS)
            ),
          ]);
          if (text.trim()) {
            const data = JSON.parse(text) as { message?: unknown; displayTitle?: unknown };
            if (typeof data.message === 'string') message = data.message;
            if (typeof data.displayTitle === 'string') displayTitle = data.displayTitle;
          }
        } catch {
          /* 表示は空のまま */
        }
        try {
          if (liveRes.ok) {
            const data = (await liveRes.json()) as { room?: { title?: string | null } };
            liveTitle = typeof data?.room?.title === 'string' ? data.room.title.trim() : '';
          }
        } catch {
          /* 表示は空のまま */
        }
        if (!cancelled) {
          setValue(message);
          setTitleValue(displayTitle || liveTitle);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const n = countLobbyMessageChars(value);
  const over = n > ROOM_LOBBY_MESSAGE_MAX_CHARS;
  const titleN = countLobbyMessageChars(titleValue);
  const titleOver = titleN > ROOM_DISPLAY_TITLE_MAX_CHARS;

  const save = async () => {
    setErr(null);
    setSavedOk(false);
    if (titleOver) {
      setErr(`部屋の名前は${ROOM_DISPLAY_TITLE_MAX_CHARS}文字以内にしてください。`);
      return;
    }
    if (over) {
      setErr(`PR文は${ROOM_LOBBY_MESSAGE_MAX_CHARS}文字以内にしてください。`);
      return;
    }
    const ac = new AbortController();
    const tid = window.setTimeout(() => ac.abort(), LOBBY_SAVE_FETCH_MS);
    setSaving(true);
    try {
      const res = await fetch('/api/room-lobby-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomId, clientId, message: value, displayTitle: titleValue }),
        signal: ac.signal,
      });
      // サーバー処理は完了しているのに body 読み取りだけ固まるブラウザがあるため、先に UI を戻す
      setSaving(false);

      let data: { error?: string } = {};
      try {
        const text = await Promise.race([
          res.text(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('body read timeout')), LOBBY_RESPONSE_BODY_MS)
          ),
        ]);
        if (text.trim()) {
          data = JSON.parse(text) as { error?: string };
        }
      } catch {
        /* body 不明時は HTTP ステータスのみで判定 */
      }

      if (!res.ok) {
        throw new Error(data?.error ?? '保存に失敗しました。');
      }
      onSaved?.({ displayTitle: titleValue.trim(), message: value.trim() });
      setSavedOk(true);
      window.setTimeout(() => setSavedOk(false), 4000);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setErr('通信がタイムアウトしました。ネットワークやサーバーの状態を確認し、再度お試しください。');
      } else {
        setErr(e instanceof Error ? e.message : '保存に失敗しました。');
      }
    } finally {
      window.clearTimeout(tid);
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 border-b border-amber-800/30 pb-4">
      <h4 className="mb-1 text-xs font-medium text-gray-300">主催者向け（部屋の名前・PR文）</h4>
      <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
        開催中の会の主催者、またはチャットオーナーが編集できます。トップの開催中一覧・部屋上部の見出しに部屋の名前が使われます（未入力時は保存されている名称が表示されます）。PR文はトップのカード内の紹介文です。
      </p>
      {loading ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : (
        <>
          <label className="mb-2 block">
            <span className="mb-1 block text-xs text-gray-400">部屋の名前</span>
            <input
              type="text"
              value={titleValue}
              onChange={(e) => {
                const t = e.target.value;
                if (countLobbyMessageChars(t) <= ROOM_DISPLAY_TITLE_MAX_CHARS) setTitleValue(t);
              }}
              maxLength={ROOM_DISPLAY_TITLE_MAX_CHARS}
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              placeholder="例: ようつべ洋楽会"
              aria-label="部屋の名前"
            />
            <span className={`mt-0.5 block text-[11px] ${titleOver ? 'text-red-400' : 'text-gray-500'}`}>
              {titleN} / {ROOM_DISPLAY_TITLE_MAX_CHARS}
            </span>
          </label>
          <label className="mb-1 block">
            <span className="mb-1 block text-xs text-gray-400">PR文（紹介・告知）</span>
          </label>
          <textarea
            value={value}
            onChange={(e) => {
              const t = e.target.value;
              if (countLobbyMessageChars(t) <= ROOM_LOBBY_MESSAGE_MAX_CHARS) setValue(t);
            }}
            rows={3}
            className="mb-1 w-full resize-y rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500"
            placeholder="例: 今夜は 80 年代中心でゆるくやってます"
            aria-label="PR文"
          />
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <span className={over ? 'text-red-400' : undefined}>
              PR {n} / {ROOM_LOBBY_MESSAGE_MAX_CHARS}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || over || titleOver}
              className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 enabled:cursor-pointer"
              style={{ cursor: saving ? 'wait' : undefined }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </>
      )}
      {savedOk && <p className="text-xs text-emerald-400">保存しました。</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

interface MyPageProps {
  onClose: () => void;
  /** 自分の発言のテキスト色（マイページで変更可能） */
  currentUserTextColor?: string;
  onUserTextColorChange?: (color: string) => void;
  /** オーナー時のみ。譲渡候補（現在在室している参加者、自分を除く） */
  chatOwnerTransferParticipants?: ParticipantForTransfer[];
  currentOwnerClientId?: string;
  myClientId?: string;
  isChatOwner?: boolean;
  onTransferOwner?: (newOwnerClientId: string) => void;
  /** ゲストの場合 true。テキスト色・選曲参加・名前変更のみ表示 */
  isGuest?: boolean;
  /** ゲストの表示名（マイページで変更可能） */
  guestDisplayName?: string;
  onGuestDisplayNameChange?: (name: string) => void;
  /** 選曲に参加するか。false なら視聴専用 */
  participatesInSelection?: boolean;
  onParticipatesInSelectionChange?: (value: boolean) => void;
  /** 自分のステータス（離席・ROM・食事中など）。参加者名横に表示 */
  userStatus?: string;
  onUserStatusChange?: (status: string) => void;
  /** オーナー時のみ。5分制限ONか。デフォルトON */
  songLimit5MinEnabled?: boolean;
  onSongLimit5MinToggle?: () => void;
  /** オーナー時のみ。AI 自由発言が停止中か */
  aiFreeSpeechStopped?: boolean;
  onAiFreeSpeechStopToggle?: () => void;
  /** オーナー時のみ。[基本, ヒット/受賞, 歌詞, サウンド] */
  commentPackSlots?: CommentPackSlotSelection;
  onCommentPackSlotsChange?: (slots: CommentPackSlotSelection) => void;
  /** オーナー時のみ。邦楽AI解説の解禁（デフォルトOFF） */
  jpAiUnlockEnabled?: boolean;
  onJpAiUnlockToggle?: () => void;
  /** オーナー時のみ。参加者を強制退出 */
  onForceExit?: (targetClientId: string, targetDisplayName: string) => void;
  /** 入室前メッセージ用。同期する部屋の roomId（例: 01） */
  roomId?: string;
  /** 部屋の名前・PR保存後の即時反映用 */
  onRoomProfileSaved?: (payload: { displayTitle: string; message: string }) => void;
  /** 参加者の入室・退室効果音（同期部屋）。未指定時はこの端末の localStorage のみ */
  joinEntryChimeEnabled?: boolean;
  onJoinEntryChimeEnabledChange?: (value: boolean) => void;
}

/** 入室・退室の効果音トグル（チャット文言は常に表示） */
function JoinEntryChimeToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm text-gray-300">{enabled ? '鳴らす' : '鳴らさない'}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={
          enabled
            ? '入室・退室の効果音はオンです。タップでオフにします。'
            : '入室・退室の効果音はオフです。タップでオンにします。'
        }
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
          enabled ? 'border-blue-500 bg-blue-600' : 'border-gray-600 bg-gray-700'
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/** マイページで選べるステータス（参加者名横に表示） */
const USER_STATUS_OPTIONS = [
  { value: '', label: 'なし' },
  { value: '離席', label: '離席' },
  { value: 'ROM', label: 'ROM' },
  { value: '食事中', label: '食事中' },
  { value: 'お風呂中', label: 'お風呂中' },
  { value: '電話中', label: '電話中' },
  { value: '仕事中', label: '仕事中' },
  { value: '眠い', label: '眠い' },
];

export default function MyPage({
  onClose,
  currentUserTextColor = DEFAULT_CHAT_TEXT_COLOR,
  onUserTextColorChange,
  chatOwnerTransferParticipants = [],
  myClientId = '',
  isChatOwner = false,
  onTransferOwner,
  isGuest = false,
  guestDisplayName = 'ゲスト',
  onGuestDisplayNameChange,
  participatesInSelection = true,
  onParticipatesInSelectionChange,
  userStatus = '',
  onUserStatusChange,
  songLimit5MinEnabled = true,
  onSongLimit5MinToggle,
  aiFreeSpeechStopped = true,
  onAiFreeSpeechStopToggle,
  commentPackSlots = DEFAULT_COMMENT_PACK_SLOTS,
  onCommentPackSlotsChange,
  jpAiUnlockEnabled = false,
  onJpAiUnlockToggle,
  onForceExit,
  roomId = '',
  onRoomProfileSaved,
  joinEntryChimeEnabled,
  onJoinEntryChimeEnabledChange,
}: MyPageProps) {
  const routeParams = useParams();
  const roomIdFromRoute = useMemo(() => {
    const p = routeParams?.roomId;
    if (typeof p === 'string') return p.trim();
    if (Array.isArray(p) && typeof p[0] === 'string') return p[0].trim();
    return '';
  }, [routeParams?.roomId]);
  const effectiveRoomId = (roomId && roomId.trim()) || roomIdFromRoute;
  const effectiveClientId =
    (myClientId && myClientId.trim()) ||
    (effectiveRoomId ? getOrCreateRoomClientId(effectiveRoomId) : '');

  const [isLiveOrganizer, setIsLiveOrganizer] = useState(false);

  const isJoinChimeControlled =
    typeof onJoinEntryChimeEnabledChange === 'function' &&
    typeof joinEntryChimeEnabled === 'boolean';
  const [joinChimeInternal, setJoinChimeInternal] = useState(() =>
    typeof window === 'undefined' ? true : readJoinEntryChimeEnabled(),
  );
  const joinChimeDisplay = isJoinChimeControlled
    ? (joinEntryChimeEnabled as boolean)
    : joinChimeInternal;
  const handleJoinChimeChange = (next: boolean) => {
    writeJoinEntryChimeEnabled(next);
    if (isJoinChimeControlled) {
      onJoinEntryChimeEnabledChange!(next);
    } else {
      setJoinChimeInternal(next);
    }
  };

  useEffect(() => {
    if (!effectiveRoomId || isGuest) {
      setIsLiveOrganizer(false);
      return;
    }
    let cancelled = false;
    void fetch(`/api/room-live-status?roomId=${encodeURIComponent(effectiveRoomId)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setIsLiveOrganizer(Boolean(data?.room?.isOrganizer));
      })
      .catch(() => {
        if (!cancelled) setIsLiveOrganizer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, isGuest]);

  /** 開催中の会の主催者、またはチャットオーナー */
  const showOrganizerRoomEditor =
    !isGuest && Boolean(effectiveRoomId && effectiveClientId) && (isChatOwner || isLiveOrganizer);
  /** チャットオーナー専用の各種トグル（主催者のみのときは非表示） */
  const showOwnerOnlyControls =
    isChatOwner &&
    Boolean(
      onTransferOwner ||
        onAiFreeSpeechStopToggle ||
        onCommentPackSlotsChange ||
        onJpAiUnlockToggle ||
        onForceExit ||
        onSongLimit5MinToggle,
    );
  const showRoomManagementPanel = showOrganizerRoomEditor || showOwnerOnlyControls;
  const showOwnerTab = showRoomManagementPanel;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!isGuest);
  const [error, setError] = useState<string | null>(null);
  const [guestNameValue, setGuestNameValue] = useState(guestDisplayName);
  const [editDisplayName, setEditDisplayName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [songHistory, setSongHistory] = useState<SongHistoryRow[]>([]);
  const [songHistoryLoading, setSongHistoryLoading] = useState(false);
  const [songHistoryPage, setSongHistoryPage] = useState(1);
  const [historyTab, setHistoryTab] = useState<'songs' | 'favorites' | 'participation' | 'mylist'>('songs');
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [participationHistory, setParticipationHistory] = useState<ParticipationHistoryRow[]>([]);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [participationPage, setParticipationPage] = useState(1);
  const [myListItems, setMyListItems] = useState<MyListItemRow[]>([]);
  const [myListLoading, setMyListLoading] = useState(false);
  const [myListAddUrl, setMyListAddUrl] = useState('');
  const [myListAddBusy, setMyListAddBusy] = useState(false);
  const [myListMessage, setMyListMessage] = useState<string | null>(null);
  const [myListEditing, setMyListEditing] = useState<string | null>(null);
  const [myListEditTitle, setMyListEditTitle] = useState('');
  const [myListEditArtist, setMyListEditArtist] = useState('');
  const [myListEditNote, setMyListEditNote] = useState('');
  const [myListEditStyle, setMyListEditStyle] = useState('');
  const [myListEditEra, setMyListEditEra] = useState('');
  const [myListSaveBusy, setMyListSaveBusy] = useState(false);
  const [myListTab, setMyListTab] = useState<'newSongs' | 'artists'>('newSongs');
  const [myListNewSongsPage, setMyListNewSongsPage] = useState(1);
  const [myListLibraryArtists, setMyListLibraryArtists] = useState<MyListLibraryArtistRow[]>([]);
  const [myListLibraryArtistExpandedId, setMyListLibraryArtistExpandedId] = useState<string | null>(null);
  const [myListArtistFilterLetter, setMyListArtistFilterLetter] = useState<string | null>(null);
  const [myListArtistProfileOpen, setMyListArtistProfileOpen] = useState(false);
  const [myListArtistProfileName, setMyListArtistProfileName] = useState('');
  const [myListArtistProfileSlug, setMyListArtistProfileSlug] = useState<string | null>(null);
  const [textColorModalOpen, setTextColorModalOpen] = useState(false);
  const [mainTab, setMainTab] = useState<'owner' | 'user' | 'music' | 'mylist'>('user');

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    setGuestNameValue(guestDisplayName);
  }, [guestDisplayName]);

  useEffect(() => {
    if (!showOwnerTab && mainTab === 'owner') setMainTab('user');
  }, [showOwnerTab, mainTab]);

  useEffect(() => {
    if (mainTab === 'mylist' && historyTab !== 'mylist') setHistoryTab('mylist');
    if (mainTab === 'music' && historyTab === 'mylist') setHistoryTab('songs');
  }, [mainTab, historyTab]);

  useEffect(() => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError('認証が利用できません。');
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setDisplayNameValue(getDisplayName(session.user));
        setEmailValue(session.user.email ?? '');
      }
      setLoading(false);
    });
  }, [supabase, isGuest]);

  const loadSongHistory = useCallback(() => {
    if (!supabase || !user) return;
    setSongHistoryLoading(true);
    void Promise.resolve(
      supabase
        .from('user_song_history')
        .select('id, room_id, video_id, url, title, artist, posted_at, selection_round')
        .order('posted_at', { ascending: false }),
    )
      .then(async ({ data, error }) => {
        if (error) {
          if (error.code === '42P01') return;
          console.error('[MyPage] song history', error);
        }
        const baseRows = ((data as SongHistoryRow[]) ?? []).map((row) => ({
          ...row,
          style: null,
          era: null,
        }));
        if (baseRows.length === 0) {
          setSongHistory([]);
          return;
        }

        const videoIds = Array.from(new Set(baseRows.map((r) => r.video_id).filter(Boolean)));
        const roomIds = Array.from(new Set(baseRows.map((r) => r.room_id).filter(Boolean)));
        const [styleRes, eraRes, playbackStyleRes] = await Promise.all([
          supabase.from('song_style').select('video_id, style').in('video_id', videoIds),
          supabase.from('song_era').select('video_id, era').in('video_id', videoIds),
          supabase
            .from('room_playback_history')
            .select('room_id, video_id, style, played_at')
            .in('video_id', videoIds)
            .in('room_id', roomIds)
            .order('played_at', { ascending: false })
            .limit(1000),
        ]);
        if (styleRes.error && styleRes.error.code !== '42P01') {
          console.error('[MyPage] song style lookup', styleRes.error);
        }
        if (eraRes.error && eraRes.error.code !== '42P01') {
          console.error('[MyPage] song era lookup', eraRes.error);
        }
        if (playbackStyleRes.error && playbackStyleRes.error.code !== '42P01') {
          console.error('[MyPage] playback style lookup', playbackStyleRes.error);
        }

        const styleMap = new Map<string, string>();
        for (const r of styleRes.data ?? []) {
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const style = typeof r.style === 'string' ? r.style.trim() : '';
          if (vid && style) styleMap.set(vid, style);
        }
        const eraMap = new Map<string, string>();
        for (const r of eraRes.data ?? []) {
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const era = typeof r.era === 'string' ? r.era.trim() : '';
          if (vid && era) eraMap.set(vid, era);
        }
        const roomVideoStyleMap = new Map<string, string>();
        for (const r of playbackStyleRes.data ?? []) {
          const roomId = typeof r.room_id === 'string' ? r.room_id : '';
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const style = typeof r.style === 'string' ? r.style.trim() : '';
          if (!roomId || !vid || !style) continue;
          const key = `${roomId}::${vid}`;
          if (!roomVideoStyleMap.has(key)) roomVideoStyleMap.set(key, style);
        }

        setSongHistory(
          baseRows.map((row) => ({
            ...row,
            style: roomVideoStyleMap.get(`${row.room_id}::${row.video_id}`) ?? styleMap.get(row.video_id) ?? null,
            era: eraMap.get(row.video_id) ?? null,
          })),
        );
      })
      .finally(() => setSongHistoryLoading(false));
  }, [supabase, user]);

  /** 初回・「貼った曲」タブへ戻る・部屋で保存成功・タブを再表示したときに最新化 */
  useEffect(() => {
    if (!user || historyTab !== 'songs') return;
    loadSongHistory();
  }, [user, historyTab, loadSongHistory]);

  useEffect(() => {
    if (!user || historyTab !== 'songs') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') loadSongHistory();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, historyTab, loadSongHistory]);

  useEffect(() => {
    if (!user || historyTab !== 'songs') return;
    const onUpdated = () => loadSongHistory();
    window.addEventListener(USER_SONG_HISTORY_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(USER_SONG_HISTORY_UPDATED_EVENT, onUpdated);
  }, [user, historyTab, loadSongHistory]);

  useEffect(() => {
    if (!user) return;
    setFavoritesLoading(true);
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        const baseRows: FavoriteRow[] = (Array.isArray(data?.items) ? data.items : []).map((row: FavoriteRow) => ({
          ...row,
          style: null,
          era: null,
        }));
        if (!baseRows.length) {
          setFavorites([]);
          return;
        }
        const videoIds = Array.from(new Set(baseRows.map((r) => r.video_id).filter(Boolean)));
        const [styleRes, eraRes, playbackStyleRes] = await Promise.all([
          supabase.from('song_style').select('video_id, style').in('video_id', videoIds),
          supabase.from('song_era').select('video_id, era').in('video_id', videoIds),
          supabase
            .from('room_playback_history')
            .select('video_id, style, played_at')
            .in('video_id', videoIds)
            .order('played_at', { ascending: false })
            .limit(1000),
        ]);
        if (styleRes.error && styleRes.error.code !== '42P01') {
          console.error('[MyPage] favorites song style lookup', styleRes.error);
        }
        if (eraRes.error && eraRes.error.code !== '42P01') {
          console.error('[MyPage] favorites song era lookup', eraRes.error);
        }
        if (playbackStyleRes.error && playbackStyleRes.error.code !== '42P01') {
          console.error('[MyPage] favorites playback style lookup', playbackStyleRes.error);
        }

        const styleMap = new Map<string, string>();
        for (const r of styleRes.data ?? []) {
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const style = typeof r.style === 'string' ? r.style.trim() : '';
          if (vid && style) styleMap.set(vid, style);
        }
        const playbackStyleMap = new Map<string, string>();
        for (const r of playbackStyleRes.data ?? []) {
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const style = typeof r.style === 'string' ? r.style.trim() : '';
          if (vid && style && !playbackStyleMap.has(vid)) playbackStyleMap.set(vid, style);
        }
        const eraMap = new Map<string, string>();
        for (const r of eraRes.data ?? []) {
          const vid = typeof r.video_id === 'string' ? r.video_id : '';
          const era = typeof r.era === 'string' ? r.era.trim() : '';
          if (vid && era) eraMap.set(vid, era);
        }

        setFavorites(
          baseRows.map((row) => ({
            ...row,
            style: playbackStyleMap.get(row.video_id) ?? styleMap.get(row.video_id) ?? null,
            era: eraMap.get(row.video_id) ?? null,
          })),
        );
      })
      .catch(() => setFavorites([]))
      .finally(() => setFavoritesLoading(false));
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;
    setParticipationLoading(true);
    fetch('/api/user-room-participation', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) =>
        setParticipationHistory(Array.isArray(data?.items) ? (data.items as ParticipationHistoryRow[]) : []),
      )
      .catch(() => setParticipationHistory([]))
      .finally(() => setParticipationLoading(false));
  }, [user]);

  const loadMyList = useCallback(async () => {
    if (!user) return;
    setMyListLoading(true);
    try {
      const [rList, rArt] = await Promise.all([
        fetch('/api/my-list', { credentials: 'include' }),
        fetch('/api/my-list/library-artists', { credentials: 'include' }),
      ]);
      const listData = (await rList.json().catch(() => ({}))) as {
        items?: MyListItemRow[];
        error?: string;
      };
      const artData = (await rArt.json().catch(() => ({}))) as {
        artists?: MyListLibraryArtistRow[];
      };
      if (!rList.ok) {
        setMyListItems([]);
        setMyListMessage(
          typeof listData?.error === 'string' ? listData.error : 'マイリストを読み込めませんでした。',
        );
      } else {
        const baseItems: MyListItemRow[] = (Array.isArray(listData?.items) ? listData.items : []).map((item) => ({
          ...item,
          style: null,
          era: null,
        }));
        if (!baseItems.length) {
          setMyListItems([]);
        } else {
          const videoIds = Array.from(new Set(baseItems.map((r) => r.video_id).filter(Boolean)));
          const [styleRes, eraRes, playbackStyleRes] = await Promise.all([
            supabase.from('song_style').select('video_id, style').in('video_id', videoIds),
            supabase.from('song_era').select('video_id, era').in('video_id', videoIds),
            supabase
              .from('room_playback_history')
              .select('video_id, style, played_at')
              .in('video_id', videoIds)
              .order('played_at', { ascending: false })
              .limit(1000),
          ]);
          if (styleRes.error && styleRes.error.code !== '42P01') {
            console.error('[MyPage] my-list song style lookup', styleRes.error);
          }
          if (eraRes.error && eraRes.error.code !== '42P01') {
            console.error('[MyPage] my-list song era lookup', eraRes.error);
          }
          if (playbackStyleRes.error && playbackStyleRes.error.code !== '42P01') {
            console.error('[MyPage] my-list playback style lookup', playbackStyleRes.error);
          }

          const styleMap = new Map<string, string>();
          for (const r of styleRes.data ?? []) {
            const vid = typeof r.video_id === 'string' ? r.video_id : '';
            const style = typeof r.style === 'string' ? r.style.trim() : '';
            if (vid && style) styleMap.set(vid, style);
          }
          const playbackStyleMap = new Map<string, string>();
          for (const r of playbackStyleRes.data ?? []) {
            const vid = typeof r.video_id === 'string' ? r.video_id : '';
            const style = typeof r.style === 'string' ? r.style.trim() : '';
            if (vid && style && !playbackStyleMap.has(vid)) playbackStyleMap.set(vid, style);
          }
          const eraMap = new Map<string, string>();
          for (const r of eraRes.data ?? []) {
            const vid = typeof r.video_id === 'string' ? r.video_id : '';
            const era = typeof r.era === 'string' ? r.era.trim() : '';
            if (vid && era) eraMap.set(vid, era);
          }

          setMyListItems(
            baseItems.map((row) => ({
              ...row,
              style: playbackStyleMap.get(row.video_id) ?? styleMap.get(row.video_id) ?? null,
              era: eraMap.get(row.video_id) ?? null,
            })),
          );
        }
      }
      if (rArt.ok && Array.isArray(artData.artists)) {
        setMyListLibraryArtists(artData.artists);
      } else {
        setMyListLibraryArtists([]);
      }
    } catch {
      setMyListItems([]);
      setMyListLibraryArtists([]);
      setMyListMessage('マイリストを読み込めませんでした。');
    } finally {
      setMyListLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    if (!user || historyTab !== 'mylist') return;
    void loadMyList();
  }, [user, historyTab, loadMyList]);

  const postMyListItem = useCallback(
    async (payload: {
      url?: string;
      videoId?: string;
      title?: string | null;
      artist?: string | null;
      note?: string | null;
      source: 'manual_url' | 'song_history' | 'favorites' | 'extension' | 'import';
    }): Promise<{ ok: true; duplicate: boolean } | { ok: false }> => {
      setMyListMessage(null);
      const res = await fetch('/api/my-list', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { duplicate?: boolean; error?: string };
      if (!res.ok) {
        setMyListMessage(typeof data?.error === 'string' ? data.error : '追加に失敗しました。');
        return { ok: false };
      }
      setMyListMessage(
        data.duplicate ? 'すでにマイリストにあります（同一動画は1件まで）。' : 'マイリストに追加しました。',
      );
      await loadMyList();
      return { ok: true, duplicate: Boolean(data.duplicate) };
    },
    [loadMyList],
  );

  const submitMyListUrl = async () => {
    if (myListAddBusy) return;
    const q = myListAddUrl.trim();
    if (!q) return;
    setMyListAddBusy(true);
    try {
      const result = await postMyListItem({ url: q, source: 'manual_url' });
      if (result.ok && !result.duplicate) setMyListAddUrl('');
    } finally {
      setMyListAddBusy(false);
    }
  };

  const removeMyListItem = async (id: string) => {
    setMyListMessage(null);
    const res = await fetch(`/api/my-list?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMyListMessage(typeof data?.error === 'string' ? data.error : '削除に失敗しました。');
      return;
    }
    setMyListMessage('削除しました。');
    await loadMyList();
  };

  const openMyListEdit = (row: MyListItemRow) => {
    const suggested = suggestMyListArtistTitleFromYoutubeStyle(row.artist, row.title);
    setMyListEditing(row.id);
    setMyListEditTitle(suggested.title);
    setMyListEditArtist(suggested.artists.join(', '));
    setMyListEditNote(row.note ?? '');
    setMyListEditStyle(row.style?.trim() ?? '');
    setMyListEditEra(row.era?.trim() ?? '');
    setMyListMessage(null);
  };

  const saveMyListEdit = async () => {
    if (!myListEditing || myListSaveBusy) return;
    setMyListSaveBusy(true);
    setMyListMessage(null);
    try {
      const res = await fetch(`/api/my-list?id=${encodeURIComponent(myListEditing)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: myListEditTitle,
          artist: myListEditArtist,
          note: myListEditNote,
          style: myListEditStyle,
          era: myListEditEra,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMyListMessage(typeof data?.error === 'string' ? data.error : '保存に失敗しました。');
        return;
      }
      setMyListEditing(null);
      setMyListMessage('保存しました。');
      await loadMyList();
    } finally {
      setMyListSaveBusy(false);
    }
  };

  const libraryArtistAlphabetBuckets = useMemo(() => {
    const m = new Map<string, MyListLibraryArtistRow[]>();
    for (const row of myListLibraryArtists) {
      const k = myListLibraryArtistIndexKey(row.display_name);
      if (!/^[A-Z]$/.test(k)) continue;
      const list = m.get(k) ?? [];
      list.push(row);
      m.set(k, list);
    }
    Array.from(m.values()).forEach((list) => {
      list.sort((x, y) =>
        myListLibraryArtistNameForIndexing(x.display_name).localeCompare(
          myListLibraryArtistNameForIndexing(y.display_name),
          'en',
          { sensitivity: 'base' },
        ),
      );
    });
    const keys = Array.from(m.keys()).sort((a, b) => a.localeCompare(b, 'en'));
    return keys.map((key) => ({ key, artists: m.get(key)! }));
  }, [myListLibraryArtists]);

  useEffect(() => {
    const letters = libraryArtistAlphabetBuckets.map((x) => x.key);
    if (letters.length === 0) {
      setMyListArtistFilterLetter(null);
      return;
    }
    if (!myListArtistFilterLetter || !letters.includes(myListArtistFilterLetter)) {
      setMyListArtistFilterLetter(letters[0]);
    }
  }, [libraryArtistAlphabetBuckets, myListArtistFilterLetter]);

  const filteredLibraryArtists = useMemo(() => {
    if (!myListArtistFilterLetter) return [];
    return libraryArtistAlphabetBuckets.find((x) => x.key === myListArtistFilterLetter)?.artists ?? [];
  }, [libraryArtistAlphabetBuckets, myListArtistFilterLetter]);

  const myListNewSongsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(myListItems.length / MY_LIST_NEW_SONGS_PAGE_SIZE)),
    [myListItems.length],
  );
  useEffect(() => {
    setMyListNewSongsPage((p) => Math.min(Math.max(1, p), myListNewSongsTotalPages));
  }, [myListNewSongsTotalPages]);
  const myListNewSongsPageItems = useMemo(() => {
    const page = Math.min(myListNewSongsPage, myListNewSongsTotalPages);
    const start = (page - 1) * MY_LIST_NEW_SONGS_PAGE_SIZE;
    return myListItems.slice(start, start + MY_LIST_NEW_SONGS_PAGE_SIZE);
  }, [myListItems, myListNewSongsPage, myListNewSongsTotalPages]);
  const myListNewSongsPaginationSlots = useMemo(
    () =>
      buildMyListNewSongsPaginationItems(
        Math.min(myListNewSongsPage, myListNewSongsTotalPages),
        myListNewSongsTotalPages,
      ),
    [myListNewSongsPage, myListNewSongsTotalPages],
  );
  const songHistoryTotalPages = useMemo(
    () => Math.max(1, Math.ceil(songHistory.length / MUSIC_HISTORY_PAGE_SIZE)),
    [songHistory.length],
  );
  useEffect(() => {
    setSongHistoryPage((p) => Math.min(Math.max(1, p), songHistoryTotalPages));
  }, [songHistoryTotalPages]);
  const songHistoryPageRows = useMemo(() => {
    const page = Math.min(songHistoryPage, songHistoryTotalPages);
    const start = (page - 1) * MUSIC_HISTORY_PAGE_SIZE;
    return songHistory.slice(start, start + MUSIC_HISTORY_PAGE_SIZE);
  }, [songHistory, songHistoryPage, songHistoryTotalPages]);
  const songHistoryPaginationSlots = useMemo(
    () =>
      buildMyListNewSongsPaginationItems(
        Math.min(songHistoryPage, songHistoryTotalPages),
        songHistoryTotalPages,
      ),
    [songHistoryPage, songHistoryTotalPages],
  );

  const favoritesTotalPages = useMemo(
    () => Math.max(1, Math.ceil(favorites.length / MUSIC_HISTORY_PAGE_SIZE)),
    [favorites.length],
  );
  useEffect(() => {
    setFavoritesPage((p) => Math.min(Math.max(1, p), favoritesTotalPages));
  }, [favoritesTotalPages]);
  const favoritesPageRows = useMemo(() => {
    const page = Math.min(favoritesPage, favoritesTotalPages);
    const start = (page - 1) * MUSIC_HISTORY_PAGE_SIZE;
    return favorites.slice(start, start + MUSIC_HISTORY_PAGE_SIZE);
  }, [favorites, favoritesPage, favoritesTotalPages]);
  const favoritesPaginationSlots = useMemo(
    () =>
      buildMyListNewSongsPaginationItems(
        Math.min(favoritesPage, favoritesTotalPages),
        favoritesTotalPages,
      ),
    [favoritesPage, favoritesTotalPages],
  );
  const participationSummaryRows = useMemo<ParticipationSummaryRow[]>(() => {
    if (participationHistory.length === 0) return [];
    const nowMs = Date.now();
    const merged = new Map<string, ParticipationSummaryRow>();

    for (const row of participationHistory) {
      const joinedMs = new Date(row.joined_at).getTime();
      if (!Number.isFinite(joinedMs)) continue;
      const rawLeftMs = row.left_at ? new Date(row.left_at).getTime() : nowMs;
      const leftMs = Number.isFinite(rawLeftMs) ? Math.max(joinedMs, rawLeftMs) : joinedMs;
      let cursor = joinedMs;
      while (cursor < leftMs) {
        const slotStartMs = participationSlotStartMs(new Date(cursor));
        const slotEndMs = slotStartMs + 12 * 60 * 60 * 1000;
        const segStart = Math.max(cursor, slotStartMs);
        const segEnd = Math.min(leftMs, slotEndMs);
        if (segEnd > segStart) {
          const roomKey = row.room_id || '—';
          const key = `${slotStartMs}::${roomKey}`;
          const prev = merged.get(key);
          const openInsideSlot = !row.left_at || (new Date(row.left_at).getTime() > slotEndMs);
          if (!prev) {
            merged.set(key, {
              slotStartMs,
              slotEndMs,
              slotLabel: formatParticipationSlotLabel(slotStartMs, slotEndMs),
              room_id: roomKey,
              gathering_title: row.gathering_title,
              display_name: row.display_name,
              first_joined_ms: segStart,
              last_left_ms: openInsideSlot ? null : segEnd,
              hasOpenSession: openInsideSlot,
              total_stay_ms: segEnd - segStart,
            });
          } else {
            prev.first_joined_ms = Math.min(prev.first_joined_ms, segStart);
            prev.total_stay_ms += segEnd - segStart;
            if (openInsideSlot) {
              prev.hasOpenSession = true;
              prev.last_left_ms = null;
            } else if (!prev.hasOpenSession) {
              prev.last_left_ms = Math.max(prev.last_left_ms ?? 0, segEnd);
            }
          }
        }
        cursor = slotEndMs;
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      if (b.slotStartMs !== a.slotStartMs) return b.slotStartMs - a.slotStartMs;
      return b.first_joined_ms - a.first_joined_ms;
    });
  }, [participationHistory]);
  const participationTotalPages = useMemo(
    () => Math.max(1, Math.ceil(participationSummaryRows.length / MUSIC_HISTORY_PAGE_SIZE)),
    [participationSummaryRows.length],
  );
  useEffect(() => {
    setParticipationPage((p) => Math.min(Math.max(1, p), participationTotalPages));
  }, [participationTotalPages]);
  const participationPageRows = useMemo(() => {
    const page = Math.min(participationPage, participationTotalPages);
    const start = (page - 1) * MUSIC_HISTORY_PAGE_SIZE;
    return participationSummaryRows.slice(start, start + MUSIC_HISTORY_PAGE_SIZE);
  }, [participationSummaryRows, participationPage, participationTotalPages]);
  const participationPaginationSlots = useMemo(
    () =>
      buildMyListNewSongsPaginationItems(
        Math.min(participationPage, participationTotalPages),
        participationTotalPages,
      ),
    [participationPage, participationTotalPages],
  );

  const openMyListArtistProfile = useCallback((displayName: string, artistSlug: string | null) => {
    setMyListArtistProfileName(displayName);
    setMyListArtistProfileSlug(artistSlug);
    setMyListArtistProfileOpen(true);
  }, []);

  const pickSongFromMyList = useCallback((url: string) => {
    const text = url.trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent(MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT, {
        detail: { text },
      }),
    );
    setMainTab('music');
    setHistoryTab('songs');
    setMyListMessage('選曲欄にセットしました。送信すると再生予約されます。');
  }, []);

  useEffect(() => {
    if (historyTab === 'songs') setSongHistoryPage(1);
    if (historyTab === 'favorites') setFavoritesPage(1);
    if (historyTab === 'participation') setParticipationPage(1);
  }, [historyTab]);

  const removeFavorite = async (videoId: string) => {
    await fetch(`/api/favorites?videoId=${encodeURIComponent(videoId)}`, { method: 'DELETE' });
    setFavorites((prev) => prev.filter((f) => f.video_id !== videoId));
  };

  const exportSongHistoryAsText = () => {
    if (!user || songHistory.length === 0) return;
    const dn = getDisplayName(user);
    const safeUser = sanitizeForFilename(dn);
    const ymd = formatDateYmdForFilename();
    const header = [
      '貼った曲の履歴',
      `ユーザー: ${dn}`,
      `出力日時: ${new Date().toLocaleString('ja-JP')}`,
      '',
      '---',
      '',
    ];
    const byDate = new Map<string, SongHistoryRow[]>();
    for (const row of songHistory) {
      const d = new Date(row.posted_at);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push(row);
    }
    const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
    Array.from(byDate.values()).forEach((rows) => {
      rows.sort(
        (a: SongHistoryRow, b: SongHistoryRow) =>
          new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
      );
    });
    const lines: string[] = [...header];
    for (const dateKey of sortedDates) {
      const [y, m, d] = dateKey.split('-');
      lines.push(`■ ${y}年${m}月${d}日`, '');
      for (const row of byDate.get(dateKey)!) {
        const at = new Date(row.posted_at);
        const timeStr = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        const roundSuffix =
          typeof row.selection_round === 'number' &&
          Number.isFinite(row.selection_round) &&
          row.selection_round >= 1
            ? ` R${Math.floor(row.selection_round)}`
            : '';
        const title = row.title || row.video_id;
        const artist = row.artist ? `（${row.artist}）` : '';
        lines.push(`部屋 ${row.room_id || '—'} · ${timeStr}${roundSuffix}`);
        lines.push(`${title}${artist}`);
        lines.push(row.url);
        lines.push('');
      }
    }
    downloadUtf8TextFile(`貼った曲リスト_${safeUser}_${ymd}.txt`, lines.join('\n'));
  };

  const exportFavoritesAsText = () => {
    if (!user || favorites.length === 0) return;
    const dn = getDisplayName(user);
    const safeUser = sanitizeForFilename(dn);
    const ymd = formatDateYmdForFilename();
    const header = [
      'お気に入りリスト',
      `ユーザー: ${dn}`,
      `出力日時: ${new Date().toLocaleString('ja-JP')}`,
      '',
      '---',
      '',
    ];
    const lines: string[] = [...header];
    for (const f of favorites) {
      const playedAt = new Date(f.played_at);
      const dateStr = playedAt.toLocaleDateString('ja-JP');
      const timeStr = playedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const artistTitle = f.artist_name && f.title ? `${f.artist_name} - ${f.title}` : (f.title || f.video_id);
      const url = `https://www.youtube.com/watch?v=${f.video_id}`;
      lines.push(`${dateStr} ${timeStr} · ${f.display_name}`);
      lines.push(artistTitle);
      lines.push(url);
      lines.push('');
    }
    downloadUtf8TextFile(`お気に入りリスト_${safeUser}_${ymd}.txt`, lines.join('\n'));
  };

  const handleSaveDisplayName = async () => {
    if (!supabase || !user) return;
    const name = displayNameValue.trim() || user.email?.split('@')[0] || 'ユーザー';
    setSaving(true);
    setSaveError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({
        data: { display_name: name },
      });
      if (err) throw err;
      setEditDisplayName(false);
      setUser((prev) =>
        prev ? { ...prev, user_metadata: { ...prev.user_metadata, display_name: name } } : null
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '表示名の更新に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!supabase || !user) return;
    setDeleteInProgress(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? 'アカウントの削除に失敗しました。');
      }
      await supabase.auth.signOut();
      onClose();
      router.push('/');
      window.location.href = '/';
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'アカウントの削除に失敗しました。');
    } finally {
      setDeleteInProgress(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!supabase || !emailValue.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ email: emailValue.trim() });
      if (err) throw err;
      setEditEmail(false);
      setUser((prev) => (prev ? { ...prev, email: emailValue.trim() } : null));
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : 'メールアドレスの更新に失敗しました。確認メールが送信される場合があります。'
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-6">
        <p className="text-gray-400">読み込み中…</p>
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-6 text-left">
        <div className="mb-4 flex items-center justify-between border-b border-gray-700 pb-3">
          <h2 className="text-lg font-semibold text-white">マイページ（ゲスト）</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
          >
            閉じる
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">表示名・テキスト色・選曲参加の設定ができます。</p>
        <div className="mb-4 rounded border border-blue-700/40 bg-blue-900/20 p-3">
          <h3 className="mb-1 text-sm font-medium text-blue-200">無料登録で使える機能</h3>
          <p className="text-xs text-gray-300">
            お気に入り保存・貼った曲履歴の永続化・設定の引き継ぎが使えます。ゲストのままでも参加できますが、
            よく使う方は登録すると便利です。
          </p>
          <div className="mt-2">
            <a
              href="/"
              className="inline-flex items-center rounded border border-blue-600 bg-blue-800/40 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-700/50"
              title="トップページで参加方法を選ぶ"
            >
              参加方法を選ぶ（ログイン/登録）
            </a>
          </div>
        </div>

        {showOrganizerRoomEditor ? (
          <div className="mb-4 rounded border border-amber-700/50 bg-amber-900/20 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-200">
              <span aria-hidden>👑</span>
              部屋管理（主催者・オーナー）
            </h3>
            <LobbyMessageOwnerBlock
              roomId={effectiveRoomId}
              clientId={effectiveClientId}
              onSaved={onRoomProfileSaved}
            />
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
            <label className="block text-xs text-gray-500">表示名</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={guestNameValue}
                onChange={(e) => setGuestNameValue(e.target.value)}
                className="flex-1 min-w-[120px] rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                placeholder="表示名"
              />
              <button
                type="button"
                onClick={() =>
                  onGuestDisplayNameChange?.(guestNameValue.trim() || assignDefaultGuestDisplayName())
                }
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                反映
              </button>
            </div>
          </div>

          <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
            <label className="block text-xs text-gray-500">選曲に参加する</label>
            <p className="mt-1 text-sm text-gray-400">オフにすると視聴専用になります（順番はスキップされます）。</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange?.(true)}
                className={`rounded px-3 py-1.5 text-sm ${participatesInSelection ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                参加する
              </button>
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange?.(false)}
                className={`rounded px-3 py-1.5 text-sm ${!participatesInSelection ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                視聴専用
              </button>
            </div>
          </div>

          <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
            <label className="block text-xs text-gray-500">参加者の入室・退室の効果音</label>
            <p className="mt-1 text-sm text-gray-400">
              オンにすると、誰かが入室したときと退室したときにそれぞれ通知音が鳴ります。オフにするとこのブラウザだけ無音です。入室・退出のチャット表示は常に出ます。設定はこの端末に保存され、入退室を繰り返しても維持されます。
            </p>
            <JoinEntryChimeToggle enabled={joinChimeDisplay} onChange={handleJoinChimeChange} />
          </div>

          <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
            <h3 className="mb-2 text-sm font-medium text-gray-300">発言のテキストカラー</h3>
            <div className="flex items-center gap-2">
              <span className="inline-block h-6 w-6 rounded-full border border-gray-600" style={{ backgroundColor: currentUserTextColor }} aria-hidden />
              <span className="text-sm text-gray-200">{currentUserTextColor}</span>
              <button
                type="button"
                onClick={() => setTextColorModalOpen(true)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
              >
                変更
              </button>
            </div>
            {textColorModalOpen && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
                role="dialog"
                aria-modal="true"
                aria-label="テキスト色を選択"
                onClick={() => setTextColorModalOpen(false)}
              >
                <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-2">
                    {CHAT_TEXT_COLOR_PALETTE.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => {
                          onUserTextColorChange?.(hex);
                          setTextColorModalOpen(false);
                        }}
                        className="h-8 w-8 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{
                          backgroundColor: hex,
                          borderColor: currentUserTextColor === hex ? '#60a5fa' : 'transparent',
                        }}
                        title={hex}
                        aria-label={`色を選択: ${hex}`}
                      />
                    ))}
                  </div>
                  <button type="button" onClick={() => setTextColorModalOpen(false)} className="mt-3 w-full rounded border border-gray-600 bg-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-600">
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-6">
        <p className="text-red-400">{error ?? 'ログイン情報を取得できませんでした。'}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
        >
          閉じる
        </button>
      </div>
    );
  }

  const currentDisplayName = getDisplayName(user);
  const currentEmail = user.email ?? '';

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-6 text-left">
      <div className="mb-4 flex items-center justify-between border-b border-gray-700 pb-3">
        <h2 className="text-lg font-semibold text-white">マイページ</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
        >
          閉じる
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500">登録情報の確認と変更ができます。</p>
      <p className="mb-3 text-xs text-gray-500">オーナー向けの部屋運用・ユーザー向けの登録情報・曲の履歴・マイリストをタブで切り替えます。</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {showOwnerTab ? (
          <button
            type="button"
            onClick={() => setMainTab('owner')}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              mainTab === 'owner' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            オーナー機能
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMainTab('user')}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            mainTab === 'user' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          ユーザー機能
        </button>
        <button
          type="button"
          onClick={() => setMainTab('music')}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            mainTab === 'music' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          曲管理
        </button>
        <button
          type="button"
          onClick={() => setMainTab('mylist')}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            mainTab === 'mylist' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          マイリスト
        </button>
      </div>

      {saveError && (
        <div className="mb-4 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {saveError}
        </div>
      )}

      {mainTab === 'owner' && showRoomManagementPanel && (
        <div className="mb-4 space-y-4">
          <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-amber-200">
              <span aria-hidden>👑</span>
              部屋管理（主催者・オーナー）
            </h3>
          </div>

          {showOrganizerRoomEditor ? (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <LobbyMessageOwnerBlock
                roomId={effectiveRoomId}
                clientId={effectiveClientId}
                onSaved={onRoomProfileSaved}
              />
            </div>
          ) : null}

          {isChatOwner && onSongLimit5MinToggle && (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-200">
                <span aria-hidden>👑</span>
                一曲5分制限
              </h4>
              <p className="mb-2 text-xs text-gray-400">ONのとき、5分経過で次の人に選曲を促します。OFFなら長いPVも最後まで視聴できます。</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={songLimit5MinEnabled ? undefined : onSongLimit5MinToggle}
                  className={`rounded px-3 py-1.5 text-sm ${songLimit5MinEnabled ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={!songLimit5MinEnabled ? undefined : onSongLimit5MinToggle}
                  className={`rounded px-3 py-1.5 text-sm ${!songLimit5MinEnabled ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  OFF
                </button>
              </div>
            </div>
          )}

          {onAiFreeSpeechStopToggle && (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <p className="mb-2 text-xs text-gray-400">
                沈黙時の AI による雑談発言の ON/OFF です。停止中は再び押すと再開できます。
              </p>
              <button
                type="button"
                onClick={onAiFreeSpeechStopToggle}
                className={`rounded border px-2 py-1.5 text-xs ${
                  aiFreeSpeechStopped
                    ? 'border-amber-600 bg-amber-900/40 text-amber-200'
                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={aiFreeSpeechStopped ? 'AI自由発言を再開' : 'AI自由発言を停止'}
              >
                AI自由発言{aiFreeSpeechStopped ? '停止中' : '停止'}
              </button>
            </div>
          )}

          {onCommentPackSlotsChange && (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <h4 className="mb-2 text-xs font-medium text-gray-300">曲紹介コメント</h4>
              <p className="mb-2 text-xs text-gray-400">
                選曲後に出す AI 解説の種類です。すべてオフにすると解説は出ません。好きな組み合わせ（例: 1 と 4
                だけ）が選べます。
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCommentPackSlotsChange(COMMENT_PACK_SLOTS_NONE)}
                  className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
                >
                  まとめてオフ
                </button>
                <button
                  type="button"
                  onClick={() => onCommentPackSlotsChange(DEFAULT_COMMENT_PACK_SLOTS)}
                  className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
                >
                  基本のみ（従来デフォルト）
                </button>
                <button
                  type="button"
                  onClick={() => onCommentPackSlotsChange(COMMENT_PACK_SLOTS_FULL)}
                  className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-600"
                >
                  4 本すべて
                </button>
              </div>
              <ul className="space-y-2 text-xs text-gray-200">
                {(
                  [
                    { i: 0 as const, label: '1. 曲の基本情報・概要' },
                    { i: 1 as const, label: '2. ヒット・受賞・話題（チャート等）' },
                    { i: 2 as const, label: '3. 歌詞のテーマ・メッセージ' },
                    { i: 3 as const, label: '4. サウンドの特徴' },
                  ] as const
                ).map(({ i, label }) => (
                  <li key={i} className="flex items-start gap-2">
                    <input
                      id={`comment-pack-slot-${i}`}
                      type="checkbox"
                      checked={commentPackSlots[i]}
                      onChange={() => onCommentPackSlotsChange(toggleCommentPackSlot(commentPackSlots, i))}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-500 bg-gray-800 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor={`comment-pack-slot-${i}`} className="cursor-pointer select-none leading-snug">
                      {label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onJpAiUnlockToggle && (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <h4 className="mb-2 text-xs font-medium text-gray-300">邦楽AI解説</h4>
              <p className="mb-2 text-xs text-gray-400">
                デフォルトは洋楽推奨（邦楽AI解説なし）です。必要なときだけ邦楽のAI解説を解禁できます。
              </p>
              <button
                type="button"
                onClick={onJpAiUnlockToggle}
                className={`rounded border px-2 py-1.5 text-xs ${
                  jpAiUnlockEnabled
                    ? 'border-emerald-600 bg-emerald-900/40 text-emerald-200'
                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={jpAiUnlockEnabled ? '邦楽AI解説を無効化' : '邦楽AI解説を解禁'}
              >
                邦楽AI解説 {jpAiUnlockEnabled ? '解禁中' : '無効（デフォルト）'}
              </button>
            </div>
          )}

          {onTransferOwner && (
            <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
              <h4 className="mb-2 text-xs font-medium text-gray-300">チャットオーナーを譲る・参加者の退出</h4>
              <p className="mb-2 text-xs text-gray-400">
                現在在室している参加者のみ対象です。譲渡するとその人がオーナーになります。
              </p>
              {chatOwnerTransferParticipants.length === 0 ? (
                <p className="text-xs text-gray-500">ほかに在室している参加者がいません。</p>
              ) : (
                <ul className="space-y-2">
                  {chatOwnerTransferParticipants.map((p) => (
                    <li key={p.clientId} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-sm text-gray-200">{p.displayName}</span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onTransferOwner(p.clientId)}
                          className="rounded border border-amber-600 bg-amber-800/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-800/50"
                        >
                          オーナーを譲る
                        </button>
                        {onForceExit && (
                          <button
                            type="button"
                            onClick={() => onForceExit(p.clientId, p.displayName)}
                            className="rounded border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-300 hover:bg-red-800/50"
                            title={`${p.displayName}さんを強制退出`}
                          >
                            強制退出
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {mainTab === 'user' ? (
          <>
        {/* 表示名 */}
        <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
          <label className="block text-xs text-gray-500">表示名</label>
          {editDisplayName ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={displayNameValue}
                onChange={(e) => setDisplayNameValue(e.target.value)}
                className="flex-1 min-w-[120px] rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                placeholder="表示名"
              />
              <button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditDisplayName(false);
                  setDisplayNameValue(currentDisplayName);
                }}
                disabled={saving}
                className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm text-gray-200">{currentDisplayName}</span>
              <button
                type="button"
                onClick={() => setEditDisplayName(true)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
              >
                変更
              </button>
            </div>
          )}
        </div>

        {/* メールアドレス */}
        <div className="rounded border border-gray-700 bg-gray-800/50 p-3">
          <label className="block text-xs text-gray-500">メールアドレス</label>
          {editEmail ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                className="flex-1 min-w-[180px] rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                placeholder="メールアドレス"
              />
              <button
                type="button"
                onClick={handleSaveEmail}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditEmail(false);
                  setEmailValue(currentEmail);
                }}
                disabled={saving}
                className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                キャンセル
              </button>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm text-gray-200">{currentEmail}</span>
              <button
                type="button"
                onClick={() => setEditEmail(true)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
              >
                変更
              </button>
            </div>
          )}
          {editEmail && (
            <p className="mt-2 text-xs text-gray-500">
              メールアドレスを変更すると、新しいアドレスに確認メールが送信される場合があります。
            </p>
          )}
        </div>

        {/* 選曲に参加する */}
        {onParticipatesInSelectionChange && (
          <div className="mt-6 rounded border border-gray-700 bg-gray-800/50 p-3">
            <label className="block text-xs text-gray-500">選曲に参加する</label>
            <p className="mt-1 text-sm text-gray-400">オフにすると視聴専用になります（順番はスキップされます）。</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange(true)}
                className={`rounded px-3 py-1.5 text-sm ${participatesInSelection ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                参加する
              </button>
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange(false)}
                className={`rounded px-3 py-1.5 text-sm ${!participatesInSelection ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                視聴専用
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 rounded border border-gray-700 bg-gray-800/50 p-3">
          <label className="block text-xs text-gray-500">参加者の入室・退室の効果音</label>
          <p className="mt-1 text-sm text-gray-400">
            オンにすると、誰かが入室したときと退室したときにそれぞれ通知音が鳴ります。オフにするとこのブラウザだけ無音です。入室・退出のチャット表示は常に出ます。設定はこの端末に保存され、入退室を繰り返しても維持されます。
          </p>
          <JoinEntryChimeToggle enabled={joinChimeDisplay} onChange={handleJoinChimeChange} />
        </div>

        {/* 自分のステータス（参加者名横に表示） */}
        {onUserStatusChange && (
          <div className="mt-6 rounded border border-gray-700/80 bg-gray-800/50 p-3">
            <h3 className="mb-2 text-sm font-medium text-gray-300">自分のステータス</h3>
            <p className="mb-2 text-xs text-gray-400">選択したステータスは参加者欄の自分の名前の横に表示されます。</p>
            <div className="flex flex-wrap gap-1.5">
              {USER_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value || 'none'}
                  type="button"
                  onClick={() => onUserStatusChange(opt.value)}
                  className={`rounded px-2.5 py-1.5 text-sm ${
                    userStatus === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 発言のテキストカラー（クリックでモーダル） */}
        <div className="mt-6 border-t border-gray-700 pt-4">
          <h3 className="mb-2 text-sm font-medium text-gray-300">発言のテキストカラー</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">現在:</span>
            <span
              className="inline-block h-6 w-6 rounded-full border border-gray-600"
              style={{ backgroundColor: currentUserTextColor }}
              aria-hidden
            />
            <span className="text-sm text-gray-200">{currentUserTextColor}</span>
            <button
              type="button"
              onClick={() => setTextColorModalOpen(true)}
              className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
            >
              変更
            </button>
          </div>
          {textColorModalOpen && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="テキスト色を選択"
              onClick={() => setTextColorModalOpen(false)}
            >
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="mb-3 text-xs text-gray-500">
                  チャットでの自分の発言の色を選べます。選択した色は保存され、次回以降も適用されます。
                </p>
                <div className="flex flex-wrap gap-2">
                  {CHAT_TEXT_COLOR_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        onUserTextColorChange?.(hex);
                        setTextColorModalOpen(false);
                      }}
                      className="h-8 w-8 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{
                        backgroundColor: hex,
                        borderColor: currentUserTextColor === hex ? '#60a5fa' : 'transparent',
                        boxShadow: currentUserTextColor === hex ? '0 0 0 2px rgba(96, 165, 250, 0.5)' : undefined,
                      }}
                      title={hex}
                      aria-label={`色を選択: ${hex}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setTextColorModalOpen(false)}
                  className="mt-3 w-full rounded border border-gray-600 bg-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-600"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
        </div>

          </>
        ) : null}

        {/* 選曲リスト / お気に入り（タブ切り替え） */}
        {mainTab === 'music' || mainTab === 'mylist' ? (
        <div className="mt-6 border-t border-gray-700 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {mainTab === 'music' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('songs')}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'songs' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                  >
                    選曲リスト
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('favorites')}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'favorites' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                  >
                    お気に入り
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('participation')}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'participation' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
                  >
                    参加履歴
                  </button>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={historyTab === 'songs' ? exportSongHistoryAsText : exportFavoritesAsText}
              disabled={
                mainTab === 'mylist' || historyTab === 'participation' || historyTab === 'mylist'
                  ? true
                  : historyTab === 'songs'
                  ? songHistoryLoading || songHistory.length === 0
                  : favoritesLoading || favorites.length === 0
              }
              className="shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                mainTab === 'mylist' || historyTab === 'participation' || historyTab === 'mylist'
                  ? 'このタブのTEXT保存は後続対応です'
                  : historyTab === 'songs'
                  ? '貼った曲リストをUTF-8テキストで保存'
                  : 'お気に入りをUTF-8テキストで保存'
              }
            >
              TEXT保存
            </button>
          </div>
          {mainTab === 'music' && historyTab === 'songs' && (
            <>
              {songHistoryLoading ? (
            <p className="text-sm text-gray-500">読み込み中…</p>
          ) : songHistory.length === 0 ? (
            <p className="text-sm text-gray-500">まだ履歴がありません。部屋でYouTubeのURLを貼ると保存されます。</p>
          ) : (
            <>
              <div className="space-y-4">
                {(() => {
                  const byDate = new Map<string, SongHistoryRow[]>();
                  for (const row of songHistoryPageRows) {
                    const d = new Date(row.posted_at);
                    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
                    byDate.get(dateKey)!.push(row);
                  }
                  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
                  Array.from(byDate.values()).forEach((rows) => {
                    rows.sort(
                      (a: SongHistoryRow, b: SongHistoryRow) =>
                        new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime(),
                    );
                  });
                  return sortedDates.map((dateKey) => {
                    const [y, m, d] = dateKey.split('-');
                    const label = `${y}年${m}月${d}日`;
                    const rows = byDate.get(dateKey)!;
                    return (
                      <div key={dateKey} className="rounded border border-gray-700 bg-gray-800/50 p-2">
                        <p className="mb-2 text-xs font-medium text-gray-400">{label}</p>
                        <ul className="space-y-2">
                          {rows.map((row) => {
                            const at = new Date(row.posted_at);
                            const timeStr = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
                            const roundSuffix =
                              typeof row.selection_round === 'number' &&
                              Number.isFinite(row.selection_round) &&
                              row.selection_round >= 1
                                ? ` R${Math.floor(row.selection_round)}`
                                : '';
                            const title = row.title || row.video_id;
                            const artist = row.artist ? `（${row.artist}）` : '';
                            return (
                              <li key={row.id} className="border-b border-gray-700/50 pb-2 last:border-0 last:pb-0">
                                <p className="text-xs text-gray-500">
                                  部屋 {row.room_id || '—'} · {timeStr}
                                  {roundSuffix}
                                </p>
                                <p className="text-sm text-gray-200">
                                  {title}
                                  {artist}
                                </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {row.style?.trim() ? (
                                  <span
                                    className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                    style={{ color: getMyPageStyleTextColor(row.style) }}
                                    title={`スタイル: ${row.style}`}
                                  >
                                    {row.style}
                                  </span>
                                ) : null}
                                {row.era?.trim() ? (
                                  <span
                                    className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                    style={{ color: getMyPageEraTextColor(row.era) }}
                                    title={`年代: ${row.era}`}
                                  >
                                    {row.era}
                                  </span>
                                ) : null}
                                {!row.style?.trim() && !row.era?.trim() ? (
                                  <span className="text-gray-500">—</span>
                                ) : null}
                              </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <a
                                    href={row.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all text-xs text-blue-400 hover:underline"
                                  >
                                    {row.url}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => pickSongFromMyList(row.url)}
                                    className="shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50"
                                    title="この曲を選曲欄にセット"
                                  >
                                    選曲
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void postMyListItem({
                                        videoId: row.video_id,
                                        url: row.url,
                                        title: row.title,
                                        artist: row.artist,
                                        source: 'song_history',
                                      })
                                    }
                                    className="shrink-0 rounded border border-violet-600/60 bg-violet-900/40 px-2 py-1 text-xs text-violet-100 hover:bg-violet-900/60"
                                    title="自分のライブラリ（マイリスト）に追加"
                                  >
                                    マイリストに追加
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
              {songHistoryTotalPages > 1 ? (
                <nav className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-gray-700/50 pt-2 text-xs" aria-label="貼った曲の履歴のページ送り">
                  <button
                    type="button"
                    disabled={Math.min(songHistoryPage, songHistoryTotalPages) <= 1}
                    onClick={() => setSongHistoryPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ←
                  </button>
                  {songHistoryPaginationSlots.map((slot, si) =>
                    slot === 'ellipsis' ? (
                      <span key={`song-history-page-ellipsis-${si}`} className="px-1 text-gray-500">
                        …
                      </span>
                    ) : (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSongHistoryPage(slot)}
                        className={`min-w-[1.75rem] rounded border px-1.5 py-1 ${
                          Math.min(songHistoryPage, songHistoryTotalPages) === slot
                            ? 'border-violet-600/70 bg-violet-900/40 text-violet-100'
                            : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {slot}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={Math.min(songHistoryPage, songHistoryTotalPages) >= songHistoryTotalPages}
                    onClick={() => setSongHistoryPage((p) => Math.min(songHistoryTotalPages, p + 1))}
                    className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    →
                  </button>
                </nav>
              ) : null}
            </>
          )}
            </>
          )}
          {mainTab === 'music' && historyTab === 'favorites' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                視聴履歴からお気に入りにした曲です。新しい順で表示しています。
              </p>
              {favoritesLoading ? (
                <p className="text-sm text-gray-500">読み込み中…</p>
              ) : favorites.length === 0 ? (
                <p className="text-sm text-gray-500">お気に入りはまだありません。部屋の視聴履歴でハートを押して追加できます。</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {favoritesPageRows.map((f) => {
                      const playedAt = new Date(f.played_at);
                      const dateStr = playedAt.toLocaleDateString('ja-JP');
                      const timeStr = playedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                      const artistTitle = f.artist_name && f.title ? `${f.artist_name} - ${f.title}` : (f.title || f.video_id);
                      const url = `https://www.youtube.com/watch?v=${f.video_id}`;
                      return (
                        <div key={f.id} className="rounded border border-gray-700 bg-gray-800/50 p-2">
                          <p className="text-xs text-gray-500">
                            {dateStr} {timeStr} · {f.display_name}
                          </p>
                          <p className="text-sm text-gray-200">{artistTitle}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {f.style?.trim() ? (
                              <span
                                className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                style={{ color: getMyPageStyleTextColor(f.style) }}
                                title={`スタイル: ${f.style}`}
                              >
                                {f.style}
                              </span>
                            ) : null}
                            {f.era?.trim() ? (
                              <span
                                className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                style={{ color: getMyPageEraTextColor(f.era) }}
                                title={`年代: ${f.era}`}
                              >
                                {f.era}
                              </span>
                            ) : null}
                            {!f.style?.trim() && !f.era?.trim() ? (
                              <span className="text-gray-500">—</span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-blue-400 hover:underline">
                              {url}
                            </a>
                            <button
                              type="button"
                              onClick={() => pickSongFromMyList(url)}
                              className="shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50"
                              title="この曲を選曲欄にセット"
                            >
                              選曲
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFavorite(f.video_id)}
                              className="shrink-0 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                              title="お気に入り解除"
                            >
                              解除
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void postMyListItem({
                                  videoId: f.video_id,
                                  url,
                                  title: f.title,
                                  artist: f.artist_name,
                                  note: `選曲者: ${f.display_name.trim() || '—'}`,
                                  source: 'favorites',
                                })
                              }
                              className="shrink-0 rounded border border-violet-600/60 bg-violet-900/40 px-2 py-1 text-xs text-violet-100 hover:bg-violet-900/60"
                              title="自分のライブラリ（マイリスト）に追加"
                            >
                              マイリストに追加
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {favoritesTotalPages > 1 ? (
                    <nav className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-gray-700/50 pt-2 text-xs" aria-label="お気に入りリストのページ送り">
                      <button
                        type="button"
                        disabled={Math.min(favoritesPage, favoritesTotalPages) <= 1}
                        onClick={() => setFavoritesPage((p) => Math.max(1, p - 1))}
                        className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ←
                      </button>
                      {favoritesPaginationSlots.map((slot, si) =>
                        slot === 'ellipsis' ? (
                          <span key={`favorites-page-ellipsis-${si}`} className="px-1 text-gray-500">
                            …
                          </span>
                        ) : (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setFavoritesPage(slot)}
                            className={`min-w-[1.75rem] rounded border px-1.5 py-1 ${
                              Math.min(favoritesPage, favoritesTotalPages) === slot
                                ? 'border-violet-600/70 bg-violet-900/40 text-violet-100'
                                : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {slot}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        disabled={Math.min(favoritesPage, favoritesTotalPages) >= favoritesTotalPages}
                        onClick={() => setFavoritesPage((p) => Math.min(favoritesTotalPages, p + 1))}
                        className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        →
                      </button>
                    </nav>
                  ) : null}
                </>
              )}
            </>
          )}
          {mainTab === 'music' && historyTab === 'participation' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                ログイン状態で入室した会の参加履歴です。入室時刻と退出時刻（取得できた場合）を表示します。
              </p>
              {participationLoading ? (
                <p className="text-sm text-gray-500">読み込み中…</p>
              ) : participationSummaryRows.length === 0 ? (
                <p className="text-sm text-gray-500">参加履歴はまだありません。</p>
              ) : (
                <>
                  <div className="space-y-3">
                    {participationPageRows.map((row) => {
                      const joinedStr = new Date(row.first_joined_ms).toLocaleString('ja-JP');
                      const leftStr = row.last_left_ms ? new Date(row.last_left_ms).toLocaleString('ja-JP') : '在室中 / 未取得';
                      return (
                        <div key={`${row.slotStartMs}-${row.room_id}`} className="rounded border border-gray-700 bg-gray-800/50 p-2">
                          <p className="text-xs text-amber-200">{row.slotLabel}</p>
                          <p className="text-xs text-gray-500">
                            部屋 {row.room_id || '—'} · {row.gathering_title || '部屋の名前未設定'}
                          </p>
                          {row.display_name ? (
                            <p className="text-xs text-gray-400">表示名（入室時）: {row.display_name}</p>
                          ) : null}
                          <p className="text-sm text-gray-200">最初の入室: {joinedStr}</p>
                          <p className="text-xs text-gray-400">最後の退出: {leftStr}</p>
                          <p className="text-xs text-emerald-300">滞在合計: {formatDurationJa(row.total_stay_ms)}</p>
                        </div>
                      );
                    })}
                  </div>
                  {participationTotalPages > 1 ? (
                    <nav className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-gray-700/50 pt-2 text-xs" aria-label="参加履歴のページ送り">
                      <button
                        type="button"
                        disabled={Math.min(participationPage, participationTotalPages) <= 1}
                        onClick={() => setParticipationPage((p) => Math.max(1, p - 1))}
                        className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ←
                      </button>
                      {participationPaginationSlots.map((slot, si) =>
                        slot === 'ellipsis' ? (
                          <span key={`participation-page-ellipsis-${si}`} className="px-1 text-gray-500">
                            …
                          </span>
                        ) : (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setParticipationPage(slot)}
                            className={`min-w-[1.75rem] rounded border px-1.5 py-1 ${
                              Math.min(participationPage, participationTotalPages) === slot
                                ? 'border-violet-600/70 bg-violet-900/40 text-violet-100'
                                : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {slot}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        disabled={Math.min(participationPage, participationTotalPages) >= participationTotalPages}
                        onClick={() => setParticipationPage((p) => Math.min(participationTotalPages, p + 1))}
                        className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        →
                      </button>
                    </nav>
                  ) : null}
                </>
              )}
            </>
          )}
          {mainTab === 'mylist' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                チャット参加とは別の<strong className="text-gray-400">自分のライブラリ</strong>です。同一の YouTube 動画（
                <code className="text-gray-400">video_id</code>）は 1 件までです。テーブル未作成のときは{' '}
                <code className="text-gray-500">docs/supabase-user-my-list-table.md</code> の SQL を Supabase で実行してください。
              </p>
              {myListMessage ? (
                <p className="mb-3 rounded border border-amber-800/50 bg-amber-900/20 px-2 py-1.5 text-xs text-amber-100">
                  {myListMessage}
                </p>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMyListTab('newSongs')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                    myListTab === 'newSongs'
                      ? 'border border-violet-600/60 bg-violet-900/40 text-violet-100'
                      : 'border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  新規追加曲
                </button>
                <button
                  type="button"
                  onClick={() => setMyListTab('artists')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                    myListTab === 'artists'
                      ? 'border border-violet-600/60 bg-violet-900/40 text-violet-100'
                      : 'border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  保存済アーティスト
                </button>
              </div>
              {myListTab === 'newSongs' ? (
                <>
                  <div className="mb-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        id="my-list-add-url"
                        type="text"
                        value={myListAddUrl}
                        onChange={(e) => setMyListAddUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void submitMyListUrl();
                        }}
                        placeholder="https://www.youtube.com/watch?v=… または dQw4w9WgXcQ"
                        className="min-w-[200px] flex-1 rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      />
                      <button
                        type="button"
                        disabled={myListAddBusy || !myListAddUrl.trim()}
                        onClick={() => void submitMyListUrl()}
                        className="shrink-0 rounded bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {myListAddBusy ? '追加中…' : '追加'}
                      </button>
                    </div>
                  </div>
                  {myListLoading ? (
                    <p className="text-sm text-gray-500">読み込み中…</p>
                  ) : myListItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      まだありません。上の欄に URL を入れると追加できます。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="max-h-72 space-y-3 overflow-y-auto">
                        {myListNewSongsPageItems.map((item) => {
                          const added = new Date(item.created_at);
                          const updated = new Date(item.updated_at);
                          const showUpdated =
                            Number.isFinite(updated.getTime()) &&
                            Number.isFinite(added.getTime()) &&
                            updated.getTime() - added.getTime() >= 1000;
                          const label =
                            item.artist && item.title
                              ? `${item.artist} — ${item.title}`
                              : item.title || item.artist || item.video_id;
                          return (
                            <div key={item.id} className="rounded border border-gray-700 bg-gray-800/50 p-2">
                              <p className="text-xs text-gray-500">
                                追加: {added.toLocaleString('ja-JP')}
                                {item.source ? <span className="ml-2 text-gray-600">· {item.source}</span> : null}
                              </p>
                              {showUpdated ? (
                                <p className="text-xs text-gray-500">最終更新: {updated.toLocaleString('ja-JP')}</p>
                              ) : null}
                              <p className="text-sm text-gray-200">{label}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {item.style?.trim() ? (
                                  <span
                                    className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                    style={{ color: getMyPageStyleTextColor(item.style) }}
                                    title={`スタイル: ${item.style}`}
                                  >
                                    {item.style}
                                  </span>
                                ) : null}
                                {item.era?.trim() ? (
                                  <span
                                    className="rounded border border-gray-700/70 bg-gray-900/40 px-1.5 py-0.5"
                                    style={{ color: getMyPageEraTextColor(item.era) }}
                                    title={`年代: ${item.era}`}
                                  >
                                    {item.era}
                                  </span>
                                ) : null}
                                {!item.style?.trim() && !item.era?.trim() ? (
                                  <span className="text-gray-500">—</span>
                                ) : null}
                              </div>
                              {myListEditing === item.id ? (
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-400">タイトル（曲名）</label>
                                    <input
                                      type="text"
                                      value={myListEditTitle}
                                      onChange={(e) => setMyListEditTitle(e.target.value)}
                                      className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-400">アーティスト（カンマ区切り可）</label>
                                    <input
                                      type="text"
                                      value={myListEditArtist}
                                      onChange={(e) => setMyListEditArtist(e.target.value)}
                                      className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-400">メモ（任意）</label>
                                    <textarea
                                      value={myListEditNote}
                                      onChange={(e) => setMyListEditNote(e.target.value)}
                                      rows={2}
                                      className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-400">スタイル</label>
                                    <select
                                      value={myListEditStyle}
                                      onChange={(e) => setMyListEditStyle(e.target.value)}
                                      className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                                    >
                                      <option value="">未設定</option>
                                      {SONG_STYLE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs text-gray-400">年代</label>
                                    <select
                                      value={myListEditEra}
                                      onChange={(e) => setMyListEditEra(e.target.value)}
                                      className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-white"
                                    >
                                      <option value="">未設定</option>
                                      {SONG_ERA_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={myListSaveBusy}
                                      onClick={() => void saveMyListEdit()}
                                      className="rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-700 disabled:opacity-40"
                                    >
                                      {myListSaveBusy ? '保存中…' : '保存'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMyListEditing(null)}
                                      className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                                    >
                                      キャンセル
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {item.note ? (
                                    <p className="mt-1 text-xs text-gray-400 whitespace-pre-wrap">{item.note}</p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-0 flex-1 break-all text-xs text-blue-400 hover:underline"
                                    >
                                      {item.url}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => pickSongFromMyList(item.url)}
                                      className="shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50"
                                    >
                                      選曲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openMyListEdit(item)}
                                      className="shrink-0 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                                    >
                                      編集
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void removeMyListItem(item.id)}
                                      className="shrink-0 rounded border border-red-900/50 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/50"
                                    >
                                      削除
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {myListNewSongsTotalPages > 1 ? (
                        <nav
                          className="flex flex-wrap items-center justify-center gap-1 border-t border-gray-700/50 pt-2 text-xs"
                          aria-label="マイリストのページ送り"
                        >
                          <button
                            type="button"
                            disabled={Math.min(myListNewSongsPage, myListNewSongsTotalPages) <= 1}
                            onClick={() => setMyListNewSongsPage((p) => Math.max(1, p - 1))}
                            className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ←
                          </button>
                          {myListNewSongsPaginationSlots.map((slot, si) =>
                            slot === 'ellipsis' ? (
                              <span key={`my-list-page-ellipsis-${si}`} className="px-1 text-gray-500">
                                …
                              </span>
                            ) : (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => setMyListNewSongsPage(slot)}
                                className={`min-w-[1.75rem] rounded border px-1.5 py-1 ${
                                  Math.min(myListNewSongsPage, myListNewSongsTotalPages) === slot
                                    ? 'border-violet-600/70 bg-violet-900/40 text-violet-100'
                                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                {slot}
                              </button>
                            ),
                          )}
                          <button
                            type="button"
                            disabled={Math.min(myListNewSongsPage, myListNewSongsTotalPages) >= myListNewSongsTotalPages}
                            onClick={() => setMyListNewSongsPage((p) => Math.min(myListNewSongsTotalPages, p + 1))}
                            className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            →
                          </button>
                        </nav>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
              {myListTab === 'artists' ? (
                <div className="rounded border border-gray-700 bg-gray-900/40 p-3">
                  <h3 className="text-sm font-medium text-gray-200">保存済みアーティスト</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    括弧内は、このアーティスト名で紐づいているマイリスト曲の件数です。アルファベットを押すと、当該文字のアーティストのみ表示します。
                  </p>
                  {myListLoading && myListLibraryArtists.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">読み込み中…</p>
                  ) : myListLibraryArtists.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-500">
                      まだありません。曲を追加すると名前ごとに集約されます。
                    </p>
                  ) : libraryArtistAlphabetBuckets.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-500">
                      現在は英字（A-Z）で始まるアーティストがありません。
                    </p>
                  ) : (
                    <>
                      <nav className="mt-2 flex flex-wrap gap-1" aria-label="アーティスト名の頭文字で絞り込み">
                        {libraryArtistAlphabetBuckets.map(({ key }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMyListArtistFilterLetter(key)}
                            className={`min-w-[1.75rem] rounded border px-1.5 py-0.5 text-center text-xs font-medium ${
                              myListArtistFilterLetter === key
                                ? 'border-violet-600/70 bg-violet-900/50 text-violet-100'
                                : 'border-gray-600 bg-gray-800/80 text-violet-200 hover:border-violet-600/60 hover:bg-violet-950/40'
                            }`}
                          >
                            {key}
                          </button>
                        ))}
                      </nav>
                      <div className="mt-2 max-h-[min(50vh,28rem)] overflow-y-auto rounded border border-gray-800/60 pr-0.5">
                        <ul className="space-y-1">
                          {filteredLibraryArtists.map((a) => {
                            const open = myListLibraryArtistExpandedId === a.id;
                            const effectiveSlug = a.artist_slug ?? buildArtistSlugForProfile(a.display_name);
                            return (
                              <li key={a.id} className="rounded border border-gray-700/80 bg-gray-800/40">
                                <div className="flex items-center gap-2 px-2 py-2">
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() =>
                                      setMyListLibraryArtistExpandedId((prev) => (prev === a.id ? null : a.id))
                                    }
                                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm text-gray-200 hover:text-white"
                                  >
                                    <span className="min-w-0 truncate font-medium">
                                      {a.display_name}
                                      <span className="ml-1 font-normal text-gray-400">（{a.linked_count}）</span>
                                    </span>
                                    <span className="shrink-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-300">
                                      {open ? '曲一覧▲' : '曲一覧▼'}
                                    </span>
                                  </button>
                                  {effectiveSlug ? (
                                    <button
                                      type="button"
                                      onClick={() => openMyListArtistProfile(a.display_name, effectiveSlug)}
                                      className="shrink-0 rounded border border-sky-700/60 bg-sky-900/30 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-900/50"
                                      title="アーティスト情報を表示"
                                    >
                                      PROFILE
                                    </button>
                                  ) : null}
                                </div>
                                {open ? (
                                  <ul className="space-y-2 border-t border-gray-700/80 px-2 py-2">
                                    {a.items.length === 0 ? (
                                      <li className="text-xs text-gray-500">紐づく曲がありません。</li>
                                    ) : (
                                      a.items.map((it) => (
                                        <li
                                          key={`${a.id}-${it.id}-${it.position}`}
                                          className="rounded bg-gray-900/50 px-2 py-1.5 text-xs text-gray-300"
                                        >
                                          <p className="font-medium text-gray-200">
                                            {it.title?.trim() || it.video_id}
                                            {it.artist?.trim() ? ` / ${it.artist.trim()}` : ''}
                                          </p>
                                          <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <a
                                              href={it.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="break-all text-blue-400 hover:underline"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              YouTube で開く
                                            </a>
                                            <button
                                              type="button"
                                              className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 text-emerald-200 hover:bg-emerald-900/50"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                pickSongFromMyList(it.url);
                                              }}
                                            >
                                              選曲
                                            </button>
                                          </div>
                                        </li>
                                      ))
                                    )}
                                  </ul>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        ) : null}

        {/* アカウント削除 */}
        {mainTab === 'user' ? (
        <div className="mt-6 border-t border-gray-700 pt-4">
          <p className="mb-2 text-xs text-gray-500">
            アカウントを削除すると、登録情報はデータベースから完全に削除され、元に戻せません。
          </p>
          {!deleteConfirmOpen ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded border border-red-800 bg-red-900/50 px-3 py-2 text-sm text-red-300 hover:bg-red-900/70"
            >
              アカウントを削除する
            </button>
          ) : (
            <div className="space-y-2 rounded border border-red-800 bg-red-900/20 p-3">
              <p className="text-sm text-red-200">
                本当にアカウントを削除しますか？ この操作は取り消せません。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteInProgress}
                  className="rounded bg-red-700 px-3 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {deleteInProgress ? '削除中…' : '削除する'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteInProgress}
                  className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
        ) : null}
      </div>
      {myListArtistProfileOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="アーティスト情報"
          onClick={() => setMyListArtistProfileOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                アーティスト情報
                <span className="ml-2 text-xs font-normal text-gray-400">{myListArtistProfileName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMyListArtistProfileOpen(false)}
                className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
              >
                閉じる
              </button>
            </div>
            <div className="rounded border border-gray-700 bg-gray-800/40">
              <MainArtistTabPanel
                artistName={myListArtistProfileSlug || myListArtistProfileName}
                songTitle={null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
