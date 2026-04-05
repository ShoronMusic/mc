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
  const [historyTab, setHistoryTab] = useState<'songs' | 'favorites' | 'participation'>('songs');
  const [favorites, setFavorites] = useState<{ id: string; video_id: string; display_name: string; played_at: string; title: string | null; artist_name: string | null }[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [participationHistory, setParticipationHistory] = useState<ParticipationHistoryRow[]>([]);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [textColorModalOpen, setTextColorModalOpen] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    setGuestNameValue(guestDisplayName);
  }, [guestDisplayName]);

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
      .then(({ data, error }) => {
        if (error) {
          if (error.code === '42P01') return;
          console.error('[MyPage] song history', error);
        }
        setSongHistory((data as SongHistoryRow[]) ?? []);
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
      .then((data) => setFavorites(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setFavorites([]))
      .finally(() => setFavoritesLoading(false));
  }, [user]);

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

      {saveError && (
        <div className="mb-4 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {saveError}
        </div>
      )}

      {showRoomManagementPanel && (
        <div className="mb-4 rounded border border-amber-700/50 bg-amber-900/20 p-3">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-amber-200">
            <span aria-hidden>👑</span>
            部屋管理（主催者・オーナー）
          </h3>

          {showOrganizerRoomEditor ? (
            <LobbyMessageOwnerBlock
              roomId={effectiveRoomId}
              clientId={effectiveClientId}
              onSaved={onRoomProfileSaved}
            />
          ) : null}

          {onAiFreeSpeechStopToggle && (
            <div className="mb-4 border-b border-amber-800/30 pb-4">
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
            <div className="mb-4 border-b border-amber-800/30 pb-4">
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
            <div className="mb-4 border-b border-amber-800/30 pb-4">
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
            <>
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
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
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

        {/* オーナー: 5分制限 */}
        {isChatOwner && onSongLimit5MinToggle && (
          <div className="mt-6 rounded border border-amber-700/50 bg-amber-900/20 p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-200">
              <span aria-hidden>👑</span>
              一曲5分制限
            </h3>
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

        {/* 貼った曲の履歴 / お気に入りリスト（タブ切り替え） */}
        <div className="mt-6 border-t border-gray-700 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setHistoryTab('songs')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'songs' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
              >
                貼った曲の履歴
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('favorites')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'favorites' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
              >
                お気に入りリスト
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('participation')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${historyTab === 'participation' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
              >
                参加履歴
              </button>
            </div>
            <button
              type="button"
              onClick={historyTab === 'songs' ? exportSongHistoryAsText : exportFavoritesAsText}
              disabled={
                historyTab === 'participation'
                  ? true
                  : historyTab === 'songs'
                  ? songHistoryLoading || songHistory.length === 0
                  : favoritesLoading || favorites.length === 0
              }
              className="shrink-0 rounded border border-emerald-700/60 bg-emerald-900/30 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                historyTab === 'participation'
                  ? '参加履歴のTEXT保存は後続対応です'
                  : historyTab === 'songs'
                  ? '貼った曲リストをUTF-8テキストで保存'
                  : 'お気に入りをUTF-8テキストで保存'
              }
            >
              TEXT保存
            </button>
          </div>
          {historyTab === 'songs' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                参加したチャットで貼った曲を日付・部屋・貼った時間で表示します（同期部屋では時間の横に選曲ラウンド R）。このタブ表示中・タブ切替・ブラウザを再表示したときに一覧を再取得します。同一曲の短時間の二重記録は抑止します。DB の追加手順は docs/supabase-song-history-table.md を参照してください。
              </p>
              {songHistoryLoading ? (
            <p className="text-sm text-gray-500">読み込み中…</p>
          ) : songHistory.length === 0 ? (
            <p className="text-sm text-gray-500">まだ履歴がありません。部屋でYouTubeのURLを貼ると保存されます。</p>
          ) : (
            <div className="max-h-64 space-y-4 overflow-y-auto">
              {(() => {
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
                                  onClick={() => {
                                    navigator.clipboard.writeText(row.url).catch(() => {});
                                  }}
                                  className="shrink-0 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                                  title="URLをコピー"
                                >
                                  URLをコピー
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
          )}
            </>
          )}
          {historyTab === 'favorites' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                視聴履歴からお気に入りにした曲です。新しい順で表示しています。
              </p>
              {favoritesLoading ? (
                <p className="text-sm text-gray-500">読み込み中…</p>
              ) : favorites.length === 0 ? (
                <p className="text-sm text-gray-500">お気に入りはまだありません。部屋の視聴履歴でハートを押して追加できます。</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {favorites.map((f) => {
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
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-blue-400 hover:underline">
                            {url}
                          </a>
                          <button
                            type="button"
                            onClick={() => removeFavorite(f.video_id)}
                            className="shrink-0 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
                            title="お気に入り解除"
                          >
                            解除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {historyTab === 'participation' && (
            <>
              <p className="mb-3 text-xs text-gray-500">
                ログイン状態で入室した会の参加履歴です。入室時刻と退出時刻（取得できた場合）を表示します。
              </p>
              {participationLoading ? (
                <p className="text-sm text-gray-500">読み込み中…</p>
              ) : participationHistory.length === 0 ? (
                <p className="text-sm text-gray-500">参加履歴はまだありません。</p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {participationHistory.map((row) => {
                    const joined = new Date(row.joined_at);
                    const left = row.left_at ? new Date(row.left_at) : null;
                    const joinedStr = joined.toLocaleString('ja-JP');
                    const leftStr = left ? left.toLocaleString('ja-JP') : '在室中 / 未取得';
                    return (
                      <div key={row.id} className="rounded border border-gray-700 bg-gray-800/50 p-2">
                        <p className="text-xs text-gray-500">
                          部屋 {row.room_id || '—'} · {row.gathering_title || '部屋の名前未設定'}
                        </p>
                        {row.display_name ? (
                          <p className="text-xs text-gray-400">表示名（入室時）: {row.display_name}</p>
                        ) : null}
                        <p className="text-sm text-gray-200">入室: {joinedStr}</p>
                        <p className="text-xs text-gray-400">退出: {leftStr}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* アカウント削除 */}
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
      </div>
    </div>
  );
}
