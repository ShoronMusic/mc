'use client';

import {
  mypageBodyTextClass,
  mypageInputClass,
  mypagePaginationBtnClass,
  mypagePanelClass,
  mypagePlayBtnClass,
  mypagePickSongBtnClass,
  mypagePrimaryBtnClass,
  mypageSecondaryBtnClass,
  mypageSectionBorderClass,
  mypageSectionTitleClass,
  mypageTabBtnClass,
  mypageMetaBadgeClass,
  mypageSongRowClass,
  mypageMessageBannerClass,
  mypageDangerBtnClass,
  mypageFieldClass,
  libraryIndexLetterBtnClass,
  librarySecondaryBtnClass,
  IS_MC_PRODUCT,
  getMypageSubtitle,
  getMypageGuestSubtitle,
  showRoomStyleUi,
} from '@/lib/product-branding';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getRoomClientId } from '@/lib/room-owner';
import { useSupabaseAuthUserId } from '@/hooks/useSupabaseAuthUserId';
import type { User } from '@supabase/supabase-js';
import {
  chatTextColorPalette,
  chatTextColorSwatchBorder,
  defaultChatTextColor,
} from '@/lib/chat-text-color';
import {
  ROOM_DISPLAY_TITLE_MAX_CHARS,
  ROOM_LOBBY_MESSAGE_MAX_CHARS,
  countLobbyMessageChars,
} from '@/lib/room-lobby-message';
import {
  type CommentPackSlotSelection,
  DEFAULT_COMMENT_PACK_SLOTS,
} from '@/lib/comment-pack-slots';
import { assignDefaultGuestDisplayName } from '@/lib/guest-display-name';
import {
  normalizeRoomDisplayName,
  roomDisplayNameValidationMessage,
} from '@/lib/room-display-name';
import {
  readJoinEntryChimeEnabled,
  writeJoinEntryChimeEnabled,
} from '@/lib/participant-join-announcements-preference';
import { useMcUiAccentTheme } from '@/hooks/useMcUiAccentTheme';
import { useMcUiFontSize, mcUiFontSizeDataAttr } from '@/hooks/useMcUiFontSize';
import { USER_SONG_HISTORY_UPDATED_EVENT } from '@/lib/user-song-history-events';
import { suggestMyListArtistTitleFromYoutubeStyle } from '@/lib/my-list-youtube-title-suggest';
import { formatFavoriteArtistTitle } from '@/lib/favorite-video-metadata';
import { MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT } from '@/lib/musicai-extension-events';
import { GuestRegisterFeatureCompareTable } from '@/components/auth/GuestRegisterFeatureCompareTable';
import MainArtistTabPanel from '@/components/room/MainArtistTabPanel';
import { MyPageModalFrame, MyPageThreeColumnBody } from '@/components/mypage/MyPageModalFrame';
import {
  MyPageMusicPreviewPanel,
  type MyPageMusicPreviewSelection,
} from '@/components/mypage/MyPageMusicPreviewPanel';
import { PersonalAiSettingsPanel } from '@/components/mypage/PersonalAiSettingsPanel';
import { MyPageAiUsageLedger } from '@/components/mypage/MyPageAiUsageLedger';
import { OwnerRoomAiSettingsPanel } from '@/components/mypage/OwnerRoomAiSettingsPanel';
import { RoomInviteFriendsSection } from '@/components/mypage/RoomInviteFriendsSection';
import { RoomJoinLockSection } from '@/components/mypage/RoomJoinLockSection';
import ThemePlaylistMissionPanel from '@/components/mypage/ThemePlaylistMissionPanel';
import {
  DEFAULT_OWNER_AI_CHARACTER_JOIN_ENABLED,
  DEFAULT_OWNER_NEXT_SONG_RECOMMEND_ENABLED,
  DEFAULT_OWNER_SONG_QUIZ_ENABLED,
} from '@/types/room-owner';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import { SONG_ERA_OPTIONS } from '@/lib/song-era-options';
import {
  USER_PUBLIC_PROFILE_ARTIST_EACH_MAX,
  USER_PUBLIC_PROFILE_ARTIST_SLOTS,
  USER_PUBLIC_PROFILE_LISTENING_MAX,
  USER_PUBLIC_PROFILE_TAGLINE_MAX,
} from '@/lib/user-public-profile';
import {
  buildParticipationSummaryRows,
  participationSummaryKey,
  type ParticipationHistoryRow,
  type ParticipationSummaryRow,
} from '@/lib/participation-summary';
import {
  geminiUsageMonthKeyJst,
  type GeminiUsageTokenSummary,
} from '@/lib/gemini-pricing';
import { type GeminiUsageCategoryId } from '@/lib/gemini-usage-categories';
import {
  AI_TRIAL_STATUS_MYPAGE_HEADING,
  AI_USAGE_DISCLOSURE_MYPAGE_PARTICIPATION,
  AI_USAGE_DISCLOSURE_MYPAGE_ROOM_COMMON,
} from '@/lib/ai-usage-disclosure-copy';
import {
  AI_CREDITS_BILLING_SUMMARY_FOOTNOTE,
  AI_CREDITS_BILLING_SUMMARY_LINES,
  AI_CREDITS_BILLING_SUMMARY_TITLE,
} from '@/lib/ai-credits-pricing-guide';
import { GeminiUsageCategoryBreakdown } from '@/components/mypage/GeminiUsageCategoryBreakdown';
import { AiTrialStatusBadge } from '@/components/shared/AiTrialStatusBadge';
import { useAiTrialStatus } from '@/hooks/useAiTrialStatus';
import { ParticipationSongHistoryModal } from '@/components/mypage/ParticipationSongHistoryModal';
import { HostedGatheringPlaybackSection } from '@/components/mypage/HostedGatheringPlaybackSection';
import { McUiAccentThemeSection } from '@/components/mypage/McUiAccentThemeSection';
import { MypageFontSizeSection } from '@/components/mypage/MypageFontSizeSection';
import { UserAtQuestionHistory } from '@/components/mypage/UserAtQuestionHistory';
import {
  MyPageSongHistoryList,
  type MyPageSongHistoryRow,
} from '@/components/mypage/MyPageSongHistoryList';
import { filterSongHistoryForParticipationSlot } from '@/lib/participation-song-history-filter';
import type { RoomAiOwnerPolicy } from '@/lib/user-room-ai-features';

export type { RoomAiOwnerPolicy };

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

function ChatTextColorSwatchButton({
  hex,
  selected,
  onSelect,
}: {
  hex: string;
  selected: boolean;
  onSelect: () => void;
}) {
  if (IS_MC_PRODUCT) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="mc-chat-text-color-swatch min-w-[4.5rem] rounded border-2 px-2 py-1 text-[10px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500"
        style={{
          backgroundColor: hex,
          color: '#ffffff',
          borderColor: chatTextColorSwatchBorder(hex, selected),
          boxShadow: selected ? '0 0 0 2px rgba(96, 165, 250, 0.5)' : undefined,
        }}
        title={hex}
        aria-label={`色を選択: ${hex}`}
      >
        {hex}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className="h-8 w-8 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
      style={{
        backgroundColor: hex,
        borderColor: chatTextColorSwatchBorder(hex, selected),
      }}
      title={hex}
      aria-label={`色を選択: ${hex}`}
    />
  );
}

function ChatTextColorCurrentBadge({ color }: { color: string }) {
  if (IS_MC_PRODUCT) {
    return (
      <span
        className="mc-chat-text-color-swatch inline-flex rounded px-2 py-0.5 text-xs font-semibold"
        style={{ backgroundColor: color, color: '#ffffff' }}
      >
        {color}
      </span>
    );
  }
  return (
    <>
      <span className="inline-block h-6 w-6 rounded-full border border-gray-600" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-sm text-gray-200">{color}</span>
    </>
  );
}

type GeminiUsageMonthlyRow = GeminiUsageTokenSummary & {
  monthKey: string;
  monthLabel: string;
};

type UserGeminiUsageSlicePayload = {
  bySlot?: Record<string, GeminiUsageTokenSummary>;
  bySlotCategory?: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  byCategory?: Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>;
  monthly?: GeminiUsageMonthlyRow[];
  monthlyByCategory?: Record<string, Record<GeminiUsageCategoryId, GeminiUsageTokenSummary>>;
  totals?: GeminiUsageTokenSummary;
};

type UserGeminiUsageSummaryPayload = UserGeminiUsageSlicePayload & {
  enabled?: boolean;
  hint?: string;
  billingMode?: string;
  personal?: UserGeminiUsageSlicePayload;
  roomCommon?: UserGeminiUsageSlicePayload;
};

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
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

interface SongHistoryRow extends MyPageSongHistoryRow {}

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
  /** false なら視聴専用（オーナー切替 UI 用。省略時は参加扱い） */
  participatesInSelection?: boolean;
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
        開催中の会の主催者、またはチャットオーナーが編集できます。トップの開催中一覧・部屋上部の見出しに部屋の名前が使われます（未入力時は保存されている名称が表示されます）。PR文はトップのカード内の紹介文です。会の終了はトップの主催者メニューから行います（全員退室だけではすぐには終わらず、一定時間で自動終了する場合があります。目安は
        <Link href="/guide/service" className="text-amber-400/90 underline-offset-2 hover:underline">
          ご利用上の注意・サービス全般
        </Link>
        ）。
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
  /** ゲスト向け: ユーザー登録モーダルを開く */
  onGuestRegisterClick?: () => void;
  /** 選曲に参加するか。false なら視聴専用 */
  participatesInSelection?: boolean;
  onParticipatesInSelectionChange?: (value: boolean) => void;
  /** 自分のステータス（離席・ROM・食事中など）。参加者名横に表示 */
  userStatus?: string;
  onUserStatusChange?: (status: string) => void;
  /** オーナー時のみ。5分制限ONか。デフォルトON */
  songLimit5MinEnabled?: boolean;
  onSongLimit5MinToggle?: () => void;
  /** オーナー時のみ。曲クイズの全体ON/OFF */
  ownerSongQuizEnabled?: boolean;
  onOwnerSongQuizToggle?: () => void;
  /** オーナー時のみ。おすすめ曲の全体ON/OFF */
  ownerNextSongRecommendEnabled?: boolean;
  onOwnerNextSongRecommendToggle?: () => void;
  /** オーナー時のみ。AIキャラクターのチャット参加ON/OFF */
  ownerAiCharacterJoinEnabled?: boolean;
  onOwnerAiCharacterJoinToggle?: () => void;
  /** オーナー時のみ。AIキャラクター表示名（デフォルト: エージェント1号） */
  ownerAiCharacterName?: string;
  onOwnerAiCharacterNameChange?: (name: string) => void;
  /** オーナー時のみ。[基本, ヒット/受賞, 歌詞, サウンド, アーティスト情報] */
  commentPackSlots?: CommentPackSlotSelection;
  onCommentPackSlotsChange?: (slots: CommentPackSlotSelection) => void;
  /** オーナー時のみ。邦楽AI解説の解禁（デフォルトOFF） */
  jpAiUnlockEnabled?: boolean;
  onJpAiUnlockToggle?: () => void;
  /** オーナー時のみ。参加者を強制退出 */
  onForceExit?: (targetClientId: string, targetDisplayName: string) => void;
  /** オーナー時のみ。他参加者の選曲参加／視聴専用を切り替え（相手はマイページで変更可） */
  onOwnerSetParticipantSelection?: (
    targetClientId: string,
    targetDisplayName: string,
    participatesInSelection: boolean,
  ) => void;
  /** 入室前メッセージ用。同期する部屋の roomId（例: 01） */
  roomId?: string;
  /** 部屋の名前・PR保存後の即時反映用 */
  onRoomProfileSaved?: (payload: { displayTitle: string; message: string }) => void;
  /** 参加者の入室・退室効果音（同期部屋）。未指定時はこの端末の localStorage のみ */
  joinEntryChimeEnabled?: boolean;
  onJoinEntryChimeEnabledChange?: (value: boolean) => void;
  /** 開いたときに表示するメインタブ（例: マイページから部屋設定を開く） */
  initialMainTab?: MyPageMainTab;
  /** 同期部屋の部屋側 AI 上限（参加者のスイッチ無効化・説明用） */
  roomAiOwnerPolicy?: RoomAiOwnerPolicy;
  /** オーナー時のみ。新規参加締切（鍵）の状態 */
  joinLocked?: boolean;
  joinLockSaving?: boolean;
  onJoinLockToggle?: () => void;
  /** 部屋にいる間。友達招待モーダルを開く */
  onInviteFriendsClick?: () => void;
}

export type MyPageMainTab =
  | 'owner'
  | 'user'
  | 'music'
  | 'participation'
  | 'questionHistory'
  | 'mylist'
  | 'themeMission';

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
const USER_STATUS_CUSTOM_MAX_LENGTH = 6;

function isPresetUserStatus(status: string): boolean {
  return USER_STATUS_OPTIONS.some((option) => option.value === status);
}

export default function MyPage({
  onClose,
  currentUserTextColor = defaultChatTextColor(),
  onUserTextColorChange,
  chatOwnerTransferParticipants = [],
  myClientId = '',
  isChatOwner = false,
  onTransferOwner,
  isGuest = false,
  guestDisplayName = 'ゲスト',
  onGuestDisplayNameChange,
  onGuestRegisterClick,
  participatesInSelection = true,
  onParticipatesInSelectionChange,
  userStatus = '',
  onUserStatusChange,
  songLimit5MinEnabled = true,
  onSongLimit5MinToggle,
  ownerSongQuizEnabled = DEFAULT_OWNER_SONG_QUIZ_ENABLED,
  onOwnerSongQuizToggle,
  ownerNextSongRecommendEnabled = DEFAULT_OWNER_NEXT_SONG_RECOMMEND_ENABLED,
  onOwnerNextSongRecommendToggle,
  ownerAiCharacterJoinEnabled = DEFAULT_OWNER_AI_CHARACTER_JOIN_ENABLED,
  onOwnerAiCharacterJoinToggle,
  ownerAiCharacterName = 'エージェント1号',
  onOwnerAiCharacterNameChange,
  commentPackSlots = DEFAULT_COMMENT_PACK_SLOTS,
  onCommentPackSlotsChange,
  jpAiUnlockEnabled = false,
  onJpAiUnlockToggle,
  onForceExit,
  onOwnerSetParticipantSelection,
  roomId = '',
  onRoomProfileSaved,
  joinEntryChimeEnabled,
  onJoinEntryChimeEnabledChange,
  initialMainTab,
  roomAiOwnerPolicy,
  joinLocked = false,
  joinLockSaving = false,
  onJoinLockToggle,
  onInviteFriendsClick,
}: MyPageProps) {
  const routeParams = useParams();
  const roomIdFromRoute = useMemo(() => {
    const p = routeParams?.roomId;
    if (typeof p === 'string') return p.trim();
    if (Array.isArray(p) && typeof p[0] === 'string') return p[0].trim();
    return '';
  }, [routeParams?.roomId]);
  const effectiveRoomId = (roomId && roomId.trim()) || roomIdFromRoute;
  const authUserIdForClient = useSupabaseAuthUserId(isGuest);
  const effectiveClientId =
    (myClientId && myClientId.trim()) ||
    (effectiveRoomId ? getRoomClientId(effectiveRoomId, authUserIdForClient) : '');

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

  const [mypageFontSize, handleMypageFontSizeChange] = useMcUiFontSize();
  const [mcUiAccentTheme, handleMcUiAccentThemeChange] = useMcUiAccentTheme();
  const mypageFrameFontSize = mypageFontSize;

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
        onOwnerAiCharacterJoinToggle ||
        onOwnerAiCharacterNameChange ||
        onOwnerSongQuizToggle ||
        onOwnerNextSongRecommendToggle ||
        onCommentPackSlotsChange ||
        onJpAiUnlockToggle ||
        onForceExit ||
        onOwnerSetParticipantSelection ||
        onSongLimit5MinToggle ||
        onJoinLockToggle,
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
  const [customUserStatus, setCustomUserStatus] = useState(() =>
    isPresetUserStatus(userStatus) ? '' : userStatus.slice(0, USER_STATUS_CUSTOM_MAX_LENGTH),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [songHistory, setSongHistory] = useState<SongHistoryRow[]>([]);
  const [songHistoryLoading, setSongHistoryLoading] = useState(false);
  const [songHistoryPage, setSongHistoryPage] = useState(1);
  const [historyTab, setHistoryTab] = useState<'songs' | 'favorites' | 'mylist'>('songs');
  const [musicPreview, setMusicPreview] = useState<MyPageMusicPreviewSelection | null>(null);
  const [focusAiCommentary, setFocusAiCommentary] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesPage, setFavoritesPage] = useState(1);
  const [participationHistory, setParticipationHistory] = useState<ParticipationHistoryRow[]>([]);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [participationSongModalSlot, setParticipationSongModalSlot] =
    useState<ParticipationSummaryRow | null>(null);
  const [participationPage, setParticipationPage] = useState(1);
  const [geminiUsageSummary, setGeminiUsageSummary] = useState<UserGeminiUsageSummaryPayload | null>(
    null,
  );
  const [geminiUsageLoading, setGeminiUsageLoading] = useState(false);
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
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileSaving, setPublicProfileSaving] = useState(false);
  const [publicVisible, setPublicVisible] = useState(false);
  const [publicTagline, setPublicTagline] = useState('');
  const [publicArtistSlots, setPublicArtistSlots] = useState<string[]>(() =>
    Array.from({ length: USER_PUBLIC_PROFILE_ARTIST_SLOTS }, () => ''),
  );
  const [publicListening, setPublicListening] = useState('');
  const [publicProfileMessage, setPublicProfileMessage] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MyPageMainTab>(initialMainTab ?? 'user');

  useEffect(() => {
    if (initialMainTab) setMainTab(initialMainTab);
  }, [initialMainTab]);

  const supabase = createClient();
  const router = useRouter();
  const { status: aiTrialStatus, state: aiTrialState } = useAiTrialStatus(isGuest);

  useEffect(() => {
    setGuestNameValue(guestDisplayName);
  }, [guestDisplayName]);

  useEffect(() => {
    if (!showOwnerTab && mainTab === 'owner') setMainTab('user');
  }, [showOwnerTab, mainTab]);

  useEffect(() => {
    if (IS_MC_PRODUCT && mainTab === 'questionHistory') setMainTab('user');
  }, [mainTab]);

  useEffect(() => {
    if (IS_MC_PRODUCT && mainTab === 'themeMission') setMainTab('user');
  }, [mainTab]);

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
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      if (user) {
        setDisplayNameValue(getDisplayName(user));
        setEmailValue(user.email ?? '');
      }
      setLoading(false);
    });
  }, [supabase, isGuest]);

  useEffect(() => {
    if (isGuest || !user?.id) {
      setPublicVisible(false);
      setPublicTagline('');
      setPublicArtistSlots(Array.from({ length: USER_PUBLIC_PROFILE_ARTIST_SLOTS }, () => ''));
      setPublicListening('');
      setPublicProfileLoading(false);
      setPublicProfileMessage(null);
      return;
    }
    let cancelled = false;
    setPublicProfileLoading(true);
    setPublicProfileMessage(null);
    void fetch('/api/user/public-profile', { credentials: 'include' })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (data?.error && typeof data.error === 'string') {
          setPublicProfileMessage(data.error.includes('テーブル') ? data.error : null);
          return;
        }
        setPublicVisible(data?.visibleInRooms === true);
        setPublicTagline(typeof data?.tagline === 'string' ? data.tagline : '');
        const raw = Array.isArray(data?.favoriteArtists) ? data.favoriteArtists : [];
        const names = raw.filter((x: unknown): x is string => typeof x === 'string').slice(0, USER_PUBLIC_PROFILE_ARTIST_SLOTS);
        const slots = [...names];
        while (slots.length < USER_PUBLIC_PROFILE_ARTIST_SLOTS) slots.push('');
        setPublicArtistSlots(slots.slice(0, USER_PUBLIC_PROFILE_ARTIST_SLOTS));
        setPublicListening(typeof data?.listeningNote === 'string' ? data.listeningNote : '');
      })
      .catch(() => {
        if (!cancelled) setPublicProfileMessage('プロフィールの読み込みに失敗しました。');
      })
      .finally(() => {
        if (!cancelled) setPublicProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, user?.id]);

  const handleSavePublicProfile = useCallback(async () => {
    setPublicProfileSaving(true);
    setPublicProfileMessage(null);
    const favoriteArtists = publicArtistSlots
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, USER_PUBLIC_PROFILE_ARTIST_EACH_MAX));
    try {
      const r = await fetch('/api/user/public-profile', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibleInRooms: publicVisible,
          tagline: publicTagline.trim(),
          favoriteArtists,
          listeningNote: publicListening.trim(),
        }),
      });
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setPublicProfileMessage(typeof data?.error === 'string' ? data.error : '保存に失敗しました。');
        return;
      }
      setPublicProfileMessage('保存しました。公開をオンにした場合、ログイン中の他ユーザーが閲覧できます。');
    } catch {
      setPublicProfileMessage('保存に失敗しました。');
    } finally {
      setPublicProfileSaving(false);
    }
  }, [publicVisible, publicTagline, publicArtistSlots, publicListening]);

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

        const commentaryPresent = new Set<string>();
        const PRESENCE_CHUNK = 80;
        for (let i = 0; i < videoIds.length; i += PRESENCE_CHUNK) {
          const chunk = videoIds.slice(i, i + PRESENCE_CHUNK);
          try {
            const presenceRes = await fetch(
              `/api/library/ai-commentary?presence=1&videoIds=${chunk
                .map((id) => encodeURIComponent(id))
                .join(',')}`,
              { credentials: 'include' },
            );
            if (!presenceRes.ok) continue;
            const presenceData = (await presenceRes.json().catch(() => null)) as {
              presentVideoIds?: string[];
            } | null;
            for (const vid of presenceData?.presentVideoIds ?? []) {
              if (typeof vid === 'string' && vid.trim()) commentaryPresent.add(vid.trim());
            }
          } catch {
            /* 解説有無は任意表示のため失敗は無視 */
          }
        }

        setSongHistory(
          baseRows.map((row) => ({
            ...row,
            style: roomVideoStyleMap.get(`${row.room_id}::${row.video_id}`) ?? styleMap.get(row.video_id) ?? null,
            era: eraMap.get(row.video_id) ?? null,
            has_ai_commentary: commentaryPresent.has(row.video_id),
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
    if (!user || mainTab !== 'participation') return;
    loadSongHistory();
  }, [user, mainTab, loadSongHistory]);

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
        if (!supabase) {
          setFavorites(baseRows);
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

  useEffect(() => {
    if (!user || IS_MC_PRODUCT) return;
    setGeminiUsageLoading(true);
    fetch('/api/user/gemini-usage-summary', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => setGeminiUsageSummary((data ?? null) as UserGeminiUsageSummaryPayload | null))
      .catch(() => setGeminiUsageSummary(null))
      .finally(() => setGeminiUsageLoading(false));
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
        } else if (!supabase) {
          setMyListItems(baseItems);
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
    }): Promise<
      { ok: true; duplicate: boolean } | { ok: false; error: string }
    > => {
      setMyListMessage(null);
      const res = await fetch('/api/my-list', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { duplicate?: boolean; error?: string };
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : '追加に失敗しました。';
        setMyListMessage(errMsg);
        return { ok: false as const, error: errMsg };
      }
      setMyListMessage(
        data.duplicate ? 'すでにマイリストにあります（同一動画は1件まで）。' : 'マイリストに追加しました。',
      );
      await loadMyList();
      return { ok: true as const, duplicate: Boolean(data.duplicate) };
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
  const participationSummaryRows = useMemo<ParticipationSummaryRow[]>(
    () => buildParticipationSummaryRows(participationHistory),
    [participationHistory],
  );
  const currentMonthGeminiUsage = useMemo(() => {
    const monthly = geminiUsageSummary?.monthly ?? [];
    if (monthly.length === 0) return null;
    const key = geminiUsageMonthKeyJst(new Date().toISOString());
    return monthly.find((m) => m.monthKey === key) ?? null;
  }, [geminiUsageSummary?.monthly]);
  const currentMonthGeminiByCategory = useMemo(() => {
    const key = geminiUsageMonthKeyJst(new Date().toISOString());
    return geminiUsageSummary?.monthlyByCategory?.[key] ?? null;
  }, [geminiUsageSummary?.monthlyByCategory]);
  const currentMonthPersonalByCategory = useMemo(() => {
    const key = geminiUsageMonthKeyJst(new Date().toISOString());
    return geminiUsageSummary?.personal?.monthlyByCategory?.[key] ?? null;
  }, [geminiUsageSummary?.personal?.monthlyByCategory]);
  const currentMonthRoomCommonByCategory = useMemo(() => {
    const key = geminiUsageMonthKeyJst(new Date().toISOString());
    return geminiUsageSummary?.roomCommon?.monthlyByCategory?.[key] ?? null;
  }, [geminiUsageSummary?.roomCommon?.monthlyByCategory]);
  const roomCommonGeminiHasData = (geminiUsageSummary?.roomCommon?.totals?.calls ?? 0) > 0;
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
  const participationSongCountByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of participationSummaryRows) {
      map.set(
        participationSummaryKey(row),
        filterSongHistoryForParticipationSlot(songHistory, row).length,
      );
    }
    return map;
  }, [participationSummaryRows, songHistory]);
  const participationModalSongs = useMemo(() => {
    if (!participationSongModalSlot) return [];
    return filterSongHistoryForParticipationSlot(songHistory, participationSongModalSlot);
  }, [participationSongModalSlot, songHistory]);

  const openMyListArtistProfile = useCallback((displayName: string, artistSlug: string | null) => {
    setMyListArtistProfileName(displayName);
    setMyListArtistProfileSlug(artistSlug);
    setMyListArtistProfileOpen(true);
  }, []);

  const openMusicPreview = useCallback((item: MyPageMusicPreviewSelection) => {
    setMusicPreview(item);
  }, []);

  const openSongHistoryPreview = useCallback(
    (row: MyPageSongHistoryRow) => {
      setFocusAiCommentary(false);
      openMusicPreview({
        videoId: row.video_id,
        url: row.url,
        title: row.title,
        artist: row.artist,
        style: row.style ?? null,
        era: row.era ?? null,
      });
    },
    [openMusicPreview],
  );

  const openSongHistoryCommentary = useCallback(
    (row: MyPageSongHistoryRow) => {
      openMusicPreview({
        videoId: row.video_id,
        url: row.url,
        title: row.title,
        artist: row.artist,
        style: row.style ?? null,
        era: row.era ?? null,
      });
      setFocusAiCommentary(true);
    },
    [openMusicPreview],
  );

  const pickSongFromMyList = useCallback((url: string) => {
    const text = url.trim();
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent(MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT, {
        detail: { text },
      }),
    );
    onClose();
  }, [onClose]);

  const addToMyListWithAlert = useCallback(
    async (payload: {
      url?: string;
      videoId?: string;
      title?: string | null;
      artist?: string | null;
      note?: string | null;
      source: 'manual_url' | 'song_history' | 'favorites' | 'extension' | 'import';
    }) => {
      const result = await postMyListItem(payload);
      if (result.ok) {
        window.alert(
          result.duplicate
            ? 'すでにマイリストにあります（同一動画は1件まで）。'
            : 'マイリストに追加しました。',
        );
      } else {
        window.alert(result.error);
      }
      return result;
    },
    [postMyListItem],
  );

  const addSongHistoryToMyList = useCallback(
    (row: MyPageSongHistoryRow) => {
      void addToMyListWithAlert({
        videoId: row.video_id,
        url: row.url,
        title: row.title,
        artist: row.artist,
        source: 'song_history',
      });
    },
    [addToMyListWithAlert],
  );

  const addToMyListFromPreview = useCallback(
    async (
      payload: {
        videoId: string;
        url: string;
        title: string | null;
        artist: string | null;
      },
      source: 'song_history' | 'favorites',
    ) => {
      if (myListAddBusy) return;
      setMyListAddBusy(true);
      try {
        await addToMyListWithAlert({ ...payload, source });
      } finally {
        setMyListAddBusy(false);
      }
    },
    [addToMyListWithAlert, myListAddBusy],
  );

  useEffect(() => {
    if (historyTab === 'songs') setSongHistoryPage(1);
    if (historyTab === 'favorites') setFavoritesPage(1);
    setMusicPreview(null);
    setFocusAiCommentary(false);
  }, [historyTab]);

  useEffect(() => {
    if (mainTab === 'participation') setParticipationPage(1);
    if (mainTab !== 'participation') setParticipationSongModalSlot(null);
    setMusicPreview(null);
    setFocusAiCommentary(false);
  }, [mainTab, myListTab]);

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
      const artistTitle = formatFavoriteArtistTitle(f.title, f.artist_name, f.video_id);
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
    const nameErr = roomDisplayNameValidationMessage(displayNameValue);
    if (nameErr) {
      setSaveError(nameErr);
      return;
    }
    const name = normalizeRoomDisplayName(displayNameValue);
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

  const ownerMgmtPanelClass = IS_MC_PRODUCT
    ? mypagePanelClass()
    : 'rounded border border-amber-700/50 bg-amber-900/20 p-3';
  const ownerMgmtHeadingClass = IS_MC_PRODUCT
    ? mypageSectionTitleClass()
    : 'flex items-center gap-1.5 text-sm font-medium text-amber-200';

  const ownerRoomManagementPanels = (
    <>
      {showOrganizerRoomEditor ? (
        <div className={ownerMgmtPanelClass}>
          <LobbyMessageOwnerBlock
            roomId={effectiveRoomId}
            clientId={effectiveClientId}
            onSaved={onRoomProfileSaved}
          />
        </div>
      ) : null}

      {isChatOwner && onSongLimit5MinToggle ? (
        <div className={ownerMgmtPanelClass}>
          <h4 className={ownerMgmtHeadingClass}>
            <span aria-hidden>👑</span>
            一曲5分制限
          </h4>
          <p className={`mb-2 text-xs ${mypageBodyTextClass()}`}>
            ONのとき、5分経過で次の人に選曲を促します。OFFなら長いPVも最後まで視聴できます。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={songLimit5MinEnabled ? undefined : onSongLimit5MinToggle}
              className={mypageTabBtnClass(songLimit5MinEnabled)}
            >
              ON
            </button>
            <button
              type="button"
              onClick={!songLimit5MinEnabled ? undefined : onSongLimit5MinToggle}
              className={mypageTabBtnClass(!songLimit5MinEnabled)}
            >
              OFF
            </button>
          </div>
        </div>
      ) : null}

      {onTransferOwner ? (
        <div className={ownerMgmtPanelClass}>
          <h4 className={`mb-2 text-xs font-medium ${IS_MC_PRODUCT ? 'text-gray-700' : 'text-gray-300'}`}>
            チャットオーナーを譲る・参加者の退出・選曲モード
          </h4>
          <p className={`mb-2 text-xs ${mypageBodyTextClass()}`}>
            現在在室している参加者のみ対象です。譲渡するとその人がオーナーになります。視聴専用にした相手はマイページからいつでも選曲参加に戻せます。オーナーも再度切り替えできます。
          </p>
          {chatOwnerTransferParticipants.length === 0 ? (
            <p className="text-xs text-gray-500">ほかに在室している参加者がいません。</p>
          ) : (
            <ul className="space-y-2">
              {chatOwnerTransferParticipants.map((p) => (
                <li key={p.clientId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`min-w-0 text-sm ${IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-200'}`}>
                    {p.displayName}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onTransferOwner(p.clientId)}
                      className={
                        IS_MC_PRODUCT
                          ? mypageSecondaryBtnClass(false)
                          : 'rounded border border-amber-600 bg-amber-800/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-800/50'
                      }
                    >
                      オーナーを譲る
                    </button>
                    {onOwnerSetParticipantSelection ? (
                      p.participatesInSelection === false ? (
                        <button
                          type="button"
                          onClick={() =>
                            onOwnerSetParticipantSelection(p.clientId, p.displayName, true)
                          }
                          className={
                            IS_MC_PRODUCT
                              ? `${mypagePrimaryBtnClass()} px-2 py-1 text-xs`
                              : 'rounded border border-sky-600 bg-sky-900/30 px-2 py-1 text-xs text-sky-200 hover:bg-sky-800/45'
                          }
                          title={`${p.displayName}さんを選曲参加に戻す`}
                        >
                          選曲参加に戻す
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onOwnerSetParticipantSelection(p.clientId, p.displayName, false)
                          }
                          className={mypageSecondaryBtnClass(false)}
                          title={`${p.displayName}さんを視聴専用にする`}
                        >
                          視聴専用にする
                        </button>
                      )
                    ) : null}
                    {onForceExit ? (
                      <button
                        type="button"
                        onClick={() => onForceExit(p.clientId, p.displayName)}
                        className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                        title={`${p.displayName}さんを強制退出`}
                      >
                        強制退出
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );

  if (loading) {
    return (
      <MyPageModalFrame title="マイページ" onClose={onClose} fontSize={mypageFrameFontSize}>
        <p className="text-gray-400">読み込み中…</p>
      </MyPageModalFrame>
    );
  }

  if (isGuest) {
    return (
      <MyPageModalFrame
        title="マイページ（ゲスト）"
        subtitle={getMypageGuestSubtitle()}
        onClose={onClose}
        fontSize={mypageFrameFontSize}
      >
        <MyPageThreeColumnBody
          col1={
            <>
        {onInviteFriendsClick && effectiveRoomId ? (
          <RoomInviteFriendsSection onInviteClick={onInviteFriendsClick} />
        ) : null}

        <div className="rounded border border-blue-700/40 bg-blue-900/20 p-3">
          <h3 className="mb-1 text-sm font-medium text-blue-200">無料登録で使える機能</h3>
          <p className="text-xs leading-relaxed text-gray-300">
            ゲストのままでも選曲・同時視聴はできます。無料登録すると下のとおり機能が増えます。
          </p>
          <GuestRegisterFeatureCompareTable className="mt-3" />
          {onGuestRegisterClick ? (
            <button
              type="button"
              onClick={onGuestRegisterClick}
              className="mt-3 w-full rounded-lg border border-blue-600 bg-blue-700/50 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600/60"
            >
              ユーザー登録
            </button>
          ) : null}
        </div>

        {showOrganizerRoomEditor ? (
          <div className="rounded border border-amber-700/50 bg-amber-900/20 p-3">
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

          <div className={mypagePanelClass()}>
            <label className="block text-xs text-gray-500">表示名</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={guestNameValue}
                onChange={(e) => setGuestNameValue(e.target.value)}
                className={mypageInputClass('min-w-[120px]')}
                placeholder="表示名"
              />
              <button
                type="button"
                onClick={() => {
                  const trimmed = guestNameValue.trim();
                  const err = trimmed ? roomDisplayNameValidationMessage(trimmed) : null;
                  if (err) {
                    setSaveError(err);
                    return;
                  }
                  setSaveError(null);
                  onGuestDisplayNameChange?.(
                    trimmed ? normalizeRoomDisplayName(trimmed) : assignDefaultGuestDisplayName(),
                  );
                }}
                className={mypagePrimaryBtnClass()}
              >
                反映
              </button>
            </div>
          </div>
            </>
          }
          col2={
          <div className={mypagePanelClass()}>
            <label className="block text-xs text-gray-500">選曲に参加する</label>
            <p className="mt-1 text-sm text-gray-400">オフにすると視聴専用になります（順番はスキップされます）。</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange?.(true)}
                className={mypageTabBtnClass(participatesInSelection)}
              >
                参加する
              </button>
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange?.(false)}
                className={mypageTabBtnClass(!participatesInSelection)}
              >
                視聴専用
              </button>
            </div>
          </div>
          }
          col3={
            <>
          {IS_MC_PRODUCT ? (
            <>
              <MypageFontSizeSection value={mypageFontSize} onChange={handleMypageFontSizeChange} />
              <McUiAccentThemeSection value={mcUiAccentTheme} onChange={handleMcUiAccentThemeChange} />
            </>
          ) : null}

          <div className={mypagePanelClass()}>
            <label className="block text-xs text-gray-500">参加者の入室・退室の効果音</label>
            <p className="mt-1 text-sm text-gray-400">
              入退室時に通知音を鳴らします（この端末のみ）。チャット表示は常に出ます。
            </p>
            <JoinEntryChimeToggle enabled={joinChimeDisplay} onChange={handleJoinChimeChange} />
          </div>

          <div className={mypagePanelClass()}>
            <h3 className="mb-2 text-sm font-medium text-gray-300">発言のテキストカラー</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">現在:</span>
              <ChatTextColorCurrentBadge color={currentUserTextColor} />
              <button
                type="button"
                onClick={() => setTextColorModalOpen(true)}
                className={mypageSecondaryBtnClass(true)}
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
              >
                <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-2">
                    {chatTextColorPalette().map((hex) => (
                      <ChatTextColorSwatchButton
                        key={hex}
                        hex={hex}
                        selected={currentUserTextColor === hex}
                        onSelect={() => {
                          onUserTextColorChange?.(hex);
                          setTextColorModalOpen(false);
                        }}
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
            </>
          }
        />
      </MyPageModalFrame>
    );
  }

  if (error || !user) {
    return (
      <MyPageModalFrame title="マイページ" onClose={onClose} fontSize={mypageFrameFontSize}>
        <p className="text-red-400">{error ?? 'ログイン情報を取得できませんでした。'}</p>
      </MyPageModalFrame>
    );
  }

  const currentDisplayName = getDisplayName(user);
  const currentEmail = user.email ?? '';

  return (
    <MyPageModalFrame
      title="マイページ"
      subtitle={getMypageSubtitle()}
      onClose={onClose}
      fontSize={mypageFrameFontSize}
    >
      <div className="mb-3 flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={() => setMainTab('user')} className={mypageTabBtnClass(mainTab === 'user')}>
          ユーザー設定
        </button>
        {showOwnerTab ? (
          <button type="button" onClick={() => setMainTab('owner')} className={mypageTabBtnClass(mainTab === 'owner')}>
            部屋設定（オーナー）
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMainTab('participation')}
          className={mypageTabBtnClass(mainTab === 'participation')}
        >
          参加履歴
        </button>
        {!IS_MC_PRODUCT && !isGuest ? (
          <button
            type="button"
            onClick={() => setMainTab('questionHistory')}
            className={mypageTabBtnClass(mainTab === 'questionHistory')}
          >
            質問履歴
          </button>
        ) : null}
        <button type="button" onClick={() => setMainTab('music')} className={mypageTabBtnClass(mainTab === 'music')}>
          曲管理
        </button>
        <button type="button" onClick={() => setMainTab('mylist')} className={mypageTabBtnClass(mainTab === 'mylist')}>
          マイリスト
        </button>
        {!IS_MC_PRODUCT ? (
          <button
            type="button"
            onClick={() => setMainTab('themeMission')}
            className={mypageTabBtnClass(mainTab === 'themeMission')}
          >
            お題プレイリスト
          </button>
        ) : null}
      </div>

      {saveError ? (
        <div className="mb-3 shrink-0 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {saveError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {mainTab === 'owner' && showRoomManagementPanel && (
        <MyPageThreeColumnBody
          col1={
            <>
              {onJoinLockToggle ? (
                <RoomJoinLockSection
                  joinLocked={joinLocked}
                  saving={joinLockSaving}
                  onToggle={onJoinLockToggle}
                />
              ) : null}

              <div className={ownerMgmtPanelClass}>
                <h3 className={ownerMgmtHeadingClass}>
                  <span aria-hidden>👑</span>
                  部屋管理（主催者・オーナー）
                </h3>
              </div>

            </>
          }
          col2={
            IS_MC_PRODUCT ? (
              ownerRoomManagementPanels
            ) : (
              <>
                <OwnerRoomAiSettingsPanel
                  ownerAiCharacterJoinEnabled={ownerAiCharacterJoinEnabled}
                  onOwnerAiCharacterJoinToggle={onOwnerAiCharacterJoinToggle}
                  ownerAiCharacterName={ownerAiCharacterName}
                  onOwnerAiCharacterNameChange={onOwnerAiCharacterNameChange}
                  commentPackSlots={commentPackSlots}
                  onCommentPackSlotsChange={onCommentPackSlotsChange}
                  ownerSongQuizEnabled={ownerSongQuizEnabled}
                  onOwnerSongQuizToggle={onOwnerSongQuizToggle}
                  ownerNextSongRecommendEnabled={ownerNextSongRecommendEnabled}
                  onOwnerNextSongRecommendToggle={onOwnerNextSongRecommendToggle}
                  jpAiUnlockEnabled={jpAiUnlockEnabled}
                  onJpAiUnlockToggle={onJpAiUnlockToggle}
                />
              </>
            )
          }
          col3={IS_MC_PRODUCT ? undefined : ownerRoomManagementPanels}
        />
      )}

      {mainTab === 'user' ? (
        <MyPageThreeColumnBody
          col1={
            <>
        {/* 表示名 */}
        <div className={mypagePanelClass()}>
          <label className="block text-xs text-gray-500">表示名</label>
          {editDisplayName ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={displayNameValue}
                onChange={(e) => setDisplayNameValue(e.target.value)}
                className={mypageInputClass('min-w-[120px]')}
                placeholder="表示名"
              />
              <button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={saving}
                className={mypagePrimaryBtnClass()}
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
                className={mypageSecondaryBtnClass()}
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
                className={mypageSecondaryBtnClass(true)}
              >
                変更
              </button>
            </div>
          )}
        </div>

        {/* メールアドレス */}
        <div className={mypagePanelClass()}>
          <label className="block text-xs text-gray-500">メールアドレス</label>
          {editEmail ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                className={mypageInputClass('min-w-[180px]')}
                placeholder="メールアドレス"
              />
              <button
                type="button"
                onClick={handleSaveEmail}
                disabled={saving}
                className={mypagePrimaryBtnClass()}
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
                className={mypageSecondaryBtnClass()}
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
                className={mypageSecondaryBtnClass(true)}
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

        {/* 発言のテキストカラー（クリックでモーダル） */}
        <div className={mypagePanelClass()}>
          <h3 className="mb-2 text-sm font-medium text-gray-300">発言のテキストカラー</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">現在:</span>
            <ChatTextColorCurrentBadge color={currentUserTextColor} />
            <button
              type="button"
              onClick={() => setTextColorModalOpen(true)}
              className={mypageSecondaryBtnClass(true)}
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
            >
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <p className="mb-3 text-xs text-gray-500">
                  {IS_MC_PRODUCT
                    ? 'チャット（白背景）での自分の発言・選曲アナウンスの色を選べます。選択した色は保存され、次回以降も適用されます。'
                    : 'チャットでの自分の発言の色を選べます。選択した色は保存され、次回以降も適用されます。'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {chatTextColorPalette().map((hex) => (
                    <ChatTextColorSwatchButton
                      key={hex}
                      hex={hex}
                      selected={currentUserTextColor === hex}
                      onSelect={() => {
                        onUserTextColorChange?.(hex);
                        setTextColorModalOpen(false);
                      }}
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

        {!IS_MC_PRODUCT ? (
          <MypageFontSizeSection value={mypageFontSize} onChange={handleMypageFontSizeChange} />
        ) : null}

        {/* 選曲に参加する */}
        {onParticipatesInSelectionChange && (
          <div className={mypagePanelClass()}>
            <label className="block text-xs text-gray-500">選曲に参加する</label>
            <p className="mt-1 text-sm text-gray-400">オフにすると視聴専用になります（順番はスキップされます）。</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange(true)}
                className={mypageTabBtnClass(participatesInSelection)}
              >
                参加する
              </button>
              <button
                type="button"
                onClick={() => onParticipatesInSelectionChange(false)}
                className={mypageTabBtnClass(!participatesInSelection)}
              >
                視聴専用
              </button>
            </div>
          </div>
        )}

        {/* 自分のステータス（参加者名横に表示） */}
        {onUserStatusChange && (
          <div className={mypagePanelClass()}>
            <h3 className={mypageSectionTitleClass()}>自分のステータス</h3>
            <p className={`mb-2 text-xs ${mypageBodyTextClass()}`}>選択したステータスは参加者欄の自分の名前の横に表示されます。</p>
            <div className="flex flex-wrap gap-1.5">
              {USER_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value || 'none'}
                  type="button"
                  onClick={() => {
                    setCustomUserStatus('');
                    onUserStatusChange(opt.value);
                  }}
                  className={mypageTabBtnClass(userStatus === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = customUserStatus.trim();
                if (next) onUserStatusChange(next);
              }}
            >
              <input
                type="text"
                value={customUserStatus}
                maxLength={USER_STATUS_CUSTOM_MAX_LENGTH}
                onChange={(event) => setCustomUserStatus(event.target.value)}
                className={mypageInputClass('min-w-0 flex-1')}
                placeholder={`自由入力（${USER_STATUS_CUSTOM_MAX_LENGTH}文字まで）`}
                aria-label="自由入力のステータス"
              />
              <button
                type="submit"
                disabled={!customUserStatus.trim() || customUserStatus.trim() === userStatus}
                className={`${mypageSecondaryBtnClass()} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                反映
              </button>
            </form>
          </div>
        )}

        <div className={mypagePanelClass()}>
          <label className="block text-xs text-gray-500">参加者の入室・退室の効果音</label>
          <p className="mt-1 text-sm text-gray-400">
            入退室時に通知音を鳴らします（この端末のみ）。チャット表示は常に出ます。
          </p>
          <JoinEntryChimeToggle enabled={joinChimeDisplay} onChange={handleJoinChimeChange} />
        </div>

        {onInviteFriendsClick && effectiveRoomId ? (
          <RoomInviteFriendsSection onInviteClick={onInviteFriendsClick} />
        ) : null}

        <div className={mypagePanelClass()}>
          <h3 className={mypageSectionTitleClass()}>アカウント削除</h3>
          <p className={`mb-2 text-xs ${mypageBodyTextClass()}`}>
            アカウントを削除すると、登録情報はデータベースから完全に削除され、元に戻せません。
          </p>
          {!deleteConfirmOpen ? (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className={mypageSecondaryBtnClass()}
            >
              アカウントを削除する
            </button>
          ) : (
            <div className="space-y-2">
              <p className={`text-sm ${mypageBodyTextClass()}`}>
                本当にアカウントを削除しますか？ この操作は取り消せません。
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteInProgress}
                  className={mypageDangerBtnClass()}
                >
                  {deleteInProgress ? '削除中…' : '削除する'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteInProgress}
                  className={mypageSecondaryBtnClass()}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

            </>
          }
          col2={
            <>
        {!IS_MC_PRODUCT ? (
          <PersonalAiSettingsPanel
            isGuest={isGuest}
            isChatOwner={isChatOwner}
            showOwnerTabLink={showOwnerTab}
            onOpenOwnerTab={() => setMainTab('owner')}
            roomAiOwnerPolicy={roomAiOwnerPolicy}
            ownerAiCharacterJoinEnabled={ownerAiCharacterJoinEnabled}
            commentPackSlots={commentPackSlots}
            onCommentPackSlotsChange={onCommentPackSlotsChange}
            betweenSections={!isGuest ? <MyPageAiUsageLedger enabled /> : null}
          />
        ) : null}
            </>
          }
          col3={
            <>
        {IS_MC_PRODUCT ? (
          <>
            <MypageFontSizeSection value={mypageFontSize} onChange={handleMypageFontSizeChange} />
            <McUiAccentThemeSection value={mcUiAccentTheme} onChange={handleMcUiAccentThemeChange} />
          </>
        ) : null}

        {/* 他ユーザー向けプロフィール（公開はオプトイン） */}
        {!isGuest ? (
          <div className={mypagePanelClass()}>
            <label className="block text-xs text-gray-500">他ユーザー向けプロフィール（任意）</label>
            <p className="mt-1 text-xs text-gray-400">
              一言・好きなアーティスト・補足を登録できます。公開をオンにすると他のログインユーザーが閲覧できます。
            </p>
            {publicProfileLoading ? (
              <p className="mt-2 text-sm text-gray-500">読み込み中…</p>
            ) : (
              <>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={publicVisible}
                    onChange={(e) => setPublicVisible(e.target.checked)}
                    className="mt-1"
                  />
                  <span>他の参加者にこの内容を公開する</span>
                </label>
                <label className="mt-3 block text-xs text-gray-500">一言</label>
                <textarea
                  value={publicTagline}
                  onChange={(e) => setPublicTagline(e.target.value.slice(0, USER_PUBLIC_PROFILE_TAGLINE_MAX))}
                  maxLength={USER_PUBLIC_PROFILE_TAGLINE_MAX}
                  rows={2}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
                  placeholder="例：00年代洋楽ロック中心で、たまにポップパンクも聴きます"
                  aria-label="プロフィールの一言"
                />
                <p className="mt-0.5 text-xs text-gray-500">
                  {publicTagline.length} / {USER_PUBLIC_PROFILE_TAGLINE_MAX} 文字
                </p>
                <p className="mt-3 text-xs text-gray-500">好きなアーティスト（最大{USER_PUBLIC_PROFILE_ARTIST_SLOTS}人・各{USER_PUBLIC_PROFILE_ARTIST_EACH_MAX}文字）</p>
                <div className="mt-1 flex flex-col gap-1.5">
                  {publicArtistSlots.map((val, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={val}
                      onChange={(e) => {
                        const t = e.target.value.slice(0, USER_PUBLIC_PROFILE_ARTIST_EACH_MAX);
                        setPublicArtistSlots((prev) => {
                          const next = [...prev];
                          next[idx] = t;
                          return next;
                        });
                      }}
                      maxLength={USER_PUBLIC_PROFILE_ARTIST_EACH_MAX}
                      className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500"
                      placeholder={`アーティスト ${idx + 1}`}
                      aria-label={`好きなアーティスト ${idx + 1}`}
                    />
                  ))}
                </div>
                <label className="mt-3 block text-xs text-gray-500">補足（最近ハマっている・部屋での立ち位置など）</label>
                <textarea
                  value={publicListening}
                  onChange={(e) => setPublicListening(e.target.value.slice(0, USER_PUBLIC_PROFILE_LISTENING_MAX))}
                  maxLength={USER_PUBLIC_PROFILE_LISTENING_MAX}
                  rows={2}
                  className="mt-1 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
                  placeholder="任意。空でも保存できます。"
                  aria-label="プロフィールの補足"
                />
                <p className="mt-0.5 text-xs text-gray-500">
                  {publicListening.length} / {USER_PUBLIC_PROFILE_LISTENING_MAX} 文字
                </p>
                <div className="mt-3 rounded border border-dashed border-gray-600 bg-gray-900/50 p-2">
                  <p className="text-xs font-medium text-gray-400">プレビュー</p>
                  <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap">
                    {publicTagline.trim() || '（一言なし）'}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-gray-300">
                    {publicArtistSlots.map((s) => s.trim()).filter(Boolean).length === 0 ? (
                      <li className="list-none text-gray-500">（アーティスト未入力）</li>
                    ) : (
                      publicArtistSlots
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((name, i) => <li key={`${name}-${i}`}>{name}</li>)
                    )}
                  </ul>
                  {publicListening.trim() ? (
                    <p className="mt-1 text-xs text-gray-400 whitespace-pre-wrap">{publicListening.trim()}</p>
                  ) : null}
                  {!publicVisible ? (
                    <p className="mt-2 text-xs text-amber-300/90">※ 現在は非公開です。公開するには上のチェックをオンに保存してください。</p>
                  ) : null}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSavePublicProfile()}
                    disabled={publicProfileSaving}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {publicProfileSaving ? '保存中…' : 'プロフィールを保存'}
                  </button>
                </div>
              </>
            )}
            {publicProfileMessage ? (
              <p
                className={`mt-2 text-xs ${
                  publicProfileMessage.startsWith('保存しました') ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {publicProfileMessage}
              </p>
            ) : null}
          </div>
        ) : null}
            </>
          }
        />
      ) : null}

        {/* 選曲リスト / お気に入り / お題プレイリスト（タブ切り替え） */}
        {mainTab === 'music' || mainTab === 'mylist' || mainTab === 'themeMission' ? (
        <div
          className={`mc-scrollbar-stable min-h-0 flex-1 ${mypageSectionBorderClass()} pt-4 ${
            (mainTab === 'music' && (historyTab === 'songs' || historyTab === 'favorites')) ||
            (mainTab === 'mylist' && myListTab === 'newSongs')
              ? 'flex flex-col overflow-y-auto'
              : 'overflow-y-auto'
          }`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {mainTab === 'music' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('songs')}
                    className={mypageTabBtnClass(historyTab === 'songs')}
                  >
                    選曲リスト
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('favorites')}
                    className={mypageTabBtnClass(historyTab === 'favorites')}
                  >
                    お気に入り
                  </button>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={historyTab === 'songs' ? exportSongHistoryAsText : exportFavoritesAsText}
              disabled={
                mainTab === 'themeMission' ||
                mainTab === 'mylist' ||
                historyTab === 'mylist'
                  ? true
                  : historyTab === 'songs'
                  ? songHistoryLoading || songHistory.length === 0
                  : favoritesLoading || favorites.length === 0
              }
              className={`shrink-0 ${mypageSecondaryBtnClass()} disabled:cursor-not-allowed disabled:opacity-40`}
              title={
                mainTab === 'themeMission' ||
                mainTab === 'mylist' ||
                historyTab === 'mylist'
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
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
              {songHistoryLoading ? (
            <p className="text-sm text-gray-500">読み込み中…</p>
          ) : songHistory.length === 0 ? (
            <p className="text-sm text-gray-500">まだ履歴がありません。部屋でYouTubeのURLを貼ると保存されます。</p>
          ) : (
            <>
              <MyPageSongHistoryList
                rows={songHistoryPageRows}
                groupByDate
                activePreviewVideoId={musicPreview?.videoId ?? null}
                onPlayPreview={openSongHistoryPreview}
                onViewCommentary={openSongHistoryCommentary}
                onPickSong={pickSongFromMyList}
                onAddToMyList={addSongHistoryToMyList}
                emptyMessage="まだ履歴がありません。部屋でYouTubeのURLを貼ると保存されます。"
              />
              {songHistoryTotalPages > 1 ? (
                <nav className={`mt-3 flex flex-wrap items-center justify-center gap-1 border-t pt-2 text-xs ${IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700/50'}`} aria-label="貼った曲の履歴のページ送り">
                  <button
                    type="button"
                    disabled={Math.min(songHistoryPage, songHistoryTotalPages) <= 1}
                    onClick={() => setSongHistoryPage((p) => Math.max(1, p - 1))}
                    className={mypageSecondaryBtnClass(true)}
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
                        className={mypagePaginationBtnClass(
                          Math.min(songHistoryPage, songHistoryTotalPages) === slot,
                        )}
                      >
                        {slot}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={Math.min(songHistoryPage, songHistoryTotalPages) >= songHistoryTotalPages}
                    onClick={() => setSongHistoryPage((p) => Math.min(songHistoryTotalPages, p + 1))}
                    className={mypageSecondaryBtnClass(true)}
                  >
                    →
                  </button>
                </nav>
              ) : null}
            </>
          )}
              </div>
              <div className="min-w-0 shrink-0 lg:sticky lg:top-2 lg:w-[min(100%,28rem)] xl:w-[min(100%,32rem)]">
                <MyPageMusicPreviewPanel
                  selection={musicPreview}
                  onPickSong={pickSongFromMyList}
                  onAddToMyList={(payload) =>
                    void addToMyListFromPreview(payload, 'song_history')
                  }
                  myListAddBusy={myListAddBusy}
                  focusAiCommentary={focusAiCommentary}
                  onFocusAiCommentaryHandled={() => setFocusAiCommentary(false)}
                />
              </div>
            </div>
          )}
          {mainTab === 'music' && historyTab === 'favorites' && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
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
                      const artistTitle = formatFavoriteArtistTitle(f.title, f.artist_name, f.video_id);
                      const url = `https://www.youtube.com/watch?v=${f.video_id}`;
                      return (
                        <div
                          key={f.id}
                          className={mypageSongRowClass(musicPreview?.videoId === f.video_id)}
                        >
                          <p className="text-xs text-gray-500">
                            {dateStr} {timeStr} · {f.display_name}
                          </p>
                          <p className={`text-sm ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-200'}`}>{artistTitle}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            {showRoomStyleUi() && f.style?.trim() ? (
                              <span
                                className={mypageMetaBadgeClass()}
                                style={{ color: getMyPageStyleTextColor(f.style) }}
                                title={`スタイル: ${f.style}`}
                              >
                                {f.style}
                              </span>
                            ) : null}
                            {f.era?.trim() ? (
                              <span
                                className={mypageMetaBadgeClass()}
                                style={{ color: getMyPageEraTextColor(f.era) }}
                                title={`年代: ${f.era}`}
                              >
                                {f.era}
                              </span>
                            ) : null}
                            {(showRoomStyleUi() ? !f.style?.trim() : true) && !f.era?.trim() ? (
                              <span className="text-gray-500">—</span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openMusicPreview({
                                  videoId: f.video_id,
                                  url,
                                  title: f.title,
                                  artist: f.artist_name,
                                  style: f.style ?? null,
                                  era: f.era ?? null,
                                })
                              }
                              className={mypagePlayBtnClass(musicPreview?.videoId === f.video_id)}
                              title="右のプレイヤーで再生"
                            >
                              再生
                            </button>
                            <a href={url} target="_blank" rel="noopener noreferrer" className={`break-all text-xs hover:underline ${IS_MC_PRODUCT ? 'text-blue-600' : 'text-blue-400'}`}>
                              {url}
                            </a>
                            <button
                              type="button"
                              onClick={() => pickSongFromMyList(url)}
                              className={mypagePickSongBtnClass()}
                              title="この曲を選曲欄にセット"
                            >
                              選曲
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFavorite(f.video_id)}
                              className={mypageSecondaryBtnClass(true)}
                              title="お気に入り解除"
                            >
                              解除
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void addToMyListWithAlert({
                                  videoId: f.video_id,
                                  url,
                                  title: f.title,
                                  artist: f.artist_name,
                                  note: `選曲者: ${f.display_name.trim() || '—'}`,
                                  source: 'favorites',
                                })
                              }
                              className={librarySecondaryBtnClass('px-2 py-1 text-xs')}
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
                    <nav className={`mt-3 flex flex-wrap items-center justify-center gap-1 border-t pt-2 text-xs ${IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700/50'}`} aria-label="お気に入りリストのページ送り">
                      <button
                        type="button"
                        disabled={Math.min(favoritesPage, favoritesTotalPages) <= 1}
                        onClick={() => setFavoritesPage((p) => Math.max(1, p - 1))}
                        className={mypageSecondaryBtnClass(true)}
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
                            className={mypagePaginationBtnClass(
                              Math.min(favoritesPage, favoritesTotalPages) === slot,
                            )}
                          >
                            {slot}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        disabled={Math.min(favoritesPage, favoritesTotalPages) >= favoritesTotalPages}
                        onClick={() => setFavoritesPage((p) => Math.min(favoritesTotalPages, p + 1))}
                        className={mypageSecondaryBtnClass(true)}
                      >
                        →
                      </button>
                    </nav>
                  ) : null}
                </>
              )}
              </div>
              <div className="min-w-0 shrink-0 lg:sticky lg:top-2 lg:w-[min(100%,28rem)] xl:w-[min(100%,32rem)]">
                <MyPageMusicPreviewPanel
                  selection={musicPreview}
                  onPickSong={pickSongFromMyList}
                  onAddToMyList={(payload) =>
                    void addToMyListFromPreview(payload, 'favorites')
                  }
                  myListAddBusy={myListAddBusy}
                />
              </div>
            </div>
          )}
          {!IS_MC_PRODUCT && mainTab === 'themeMission' && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-200">お題プレイリスト（β）</h3>
              <ThemePlaylistMissionPanel
                isGuest={isGuest}
                canDeleteRecordedEntries={!isGuest && (!effectiveRoomId.trim() || isChatOwner)}
              />
            </div>
          )}
          {mainTab === 'mylist' && (
            <>
              <p className={`mb-3 text-xs ${mypageBodyTextClass()}`}>
                チャット参加とは別の<strong className={IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-400'}>自分のライブラリ</strong>です。同一の YouTube 動画（
                <code className={IS_MC_PRODUCT ? 'text-gray-600' : 'text-gray-400'}>video_id</code>）は 1 件までです。テーブル未作成のときは{' '}
                <code className="text-gray-500">docs/supabase-user-my-list-table.md</code> の SQL を Supabase で実行してください。
              </p>
              {myListMessage ? (
                <p className={mypageMessageBannerClass()}>{myListMessage}</p>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMyListTab('newSongs')}
                  className={mypageTabBtnClass(myListTab === 'newSongs')}
                >
                  新規追加曲
                </button>
                <button
                  type="button"
                  onClick={() => setMyListTab('artists')}
                  className={mypageTabBtnClass(myListTab === 'artists')}
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
                        className={mypageInputClass('min-w-[200px]')}
                      />
                      <button
                        type="button"
                        disabled={myListAddBusy || !myListAddUrl.trim()}
                        onClick={() => void submitMyListUrl()}
                        className={`shrink-0 ${mypagePrimaryBtnClass()} disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {myListAddBusy ? '追加中…' : '追加'}
                      </button>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                  {myListLoading ? (
                    <p className="text-sm text-gray-500">読み込み中…</p>
                  ) : myListItems.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      まだありません。上の欄に URL を入れると追加できます。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-3">
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
                            <div
                              key={item.id}
                              className={mypageSongRowClass(musicPreview?.videoId === item.video_id)}
                            >
                              <p className="text-xs text-gray-500">
                                追加: {added.toLocaleString('ja-JP')}
                                {item.source ? <span className="ml-2 text-gray-500">· {item.source}</span> : null}
                              </p>
                              {showUpdated ? (
                                <p className="text-xs text-gray-500">最終更新: {updated.toLocaleString('ja-JP')}</p>
                              ) : null}
                              <p className={`text-sm ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-200'}`}>{label}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                {showRoomStyleUi() && item.style?.trim() ? (
                                  <span
                                    className={mypageMetaBadgeClass()}
                                    style={{ color: getMyPageStyleTextColor(item.style) }}
                                    title={`スタイル: ${item.style}`}
                                  >
                                    {item.style}
                                  </span>
                                ) : null}
                                {item.era?.trim() ? (
                                  <span
                                    className={mypageMetaBadgeClass()}
                                    style={{ color: getMyPageEraTextColor(item.era) }}
                                    title={`年代: ${item.era}`}
                                  >
                                    {item.era}
                                  </span>
                                ) : null}
                                {(showRoomStyleUi() ? !item.style?.trim() : true) && !item.era?.trim() ? (
                                  <span className="text-gray-500">—</span>
                                ) : null}
                              </div>
                              {myListEditing === item.id ? (
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <label className={`mb-1 block text-xs ${mypageBodyTextClass()}`}>タイトル（曲名）</label>
                                    <input
                                      type="text"
                                      value={myListEditTitle}
                                      onChange={(e) => setMyListEditTitle(e.target.value)}
                                      className={mypageFieldClass()}
                                    />
                                  </div>
                                  <div>
                                    <label className={`mb-1 block text-xs ${mypageBodyTextClass()}`}>アーティスト（カンマ区切り可）</label>
                                    <input
                                      type="text"
                                      value={myListEditArtist}
                                      onChange={(e) => setMyListEditArtist(e.target.value)}
                                      className={mypageFieldClass()}
                                    />
                                  </div>
                                  <div>
                                    <label className={`mb-1 block text-xs ${mypageBodyTextClass()}`}>メモ（任意）</label>
                                    <textarea
                                      value={myListEditNote}
                                      onChange={(e) => setMyListEditNote(e.target.value)}
                                      rows={2}
                                      className={mypageFieldClass()}
                                    />
                                  </div>
                                  {showRoomStyleUi() ? (
                                    <div>
                                      <label className={`mb-1 block text-xs ${mypageBodyTextClass()}`}>スタイル</label>
                                      <select
                                        value={myListEditStyle}
                                        onChange={(e) => setMyListEditStyle(e.target.value)}
                                        className={mypageFieldClass()}
                                      >
                                        <option value="">未設定</option>
                                        {SONG_STYLE_OPTIONS.map((opt) => (
                                          <option key={opt} value={opt}>
                                            {opt}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : null}
                                  <div>
                                    <label className={`mb-1 block text-xs ${mypageBodyTextClass()}`}>年代</label>
                                    <select
                                      value={myListEditEra}
                                      onChange={(e) => setMyListEditEra(e.target.value)}
                                      className={mypageFieldClass()}
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
                                      className={`${mypagePrimaryBtnClass()} px-2 py-1 text-xs disabled:opacity-40`}
                                    >
                                      {myListSaveBusy ? '保存中…' : '保存'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMyListEditing(null)}
                                      className={mypageSecondaryBtnClass(true)}
                                    >
                                      キャンセル
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {item.note ? (
                                    <p className={`mt-1 text-xs whitespace-pre-wrap ${mypageBodyTextClass()}`}>{item.note}</p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openMusicPreview({
                                          videoId: item.video_id,
                                          url: item.url,
                                          title: item.title,
                                          artist: item.artist,
                                          style: item.style ?? null,
                                          era: item.era ?? null,
                                        })
                                      }
                                      className={mypagePlayBtnClass(musicPreview?.videoId === item.video_id)}
                                      title="右のプレイヤーで再生"
                                    >
                                      再生
                                    </button>
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`min-w-0 flex-1 break-all text-xs hover:underline ${IS_MC_PRODUCT ? 'text-blue-600' : 'text-blue-400'}`}
                                    >
                                      {item.url}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => pickSongFromMyList(item.url)}
                                      className={mypagePickSongBtnClass()}
                                    >
                                      選曲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openMyListEdit(item)}
                                      className={mypageSecondaryBtnClass(true)}
                                    >
                                      編集
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void removeMyListItem(item.id)}
                                      className={mypageDangerBtnClass(true)}
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
                          className={`flex flex-wrap items-center justify-center gap-1 border-t pt-2 text-xs ${IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700/50'}`}
                          aria-label="マイリストのページ送り"
                        >
                          <button
                            type="button"
                            disabled={Math.min(myListNewSongsPage, myListNewSongsTotalPages) <= 1}
                            onClick={() => setMyListNewSongsPage((p) => Math.max(1, p - 1))}
                            className={mypageSecondaryBtnClass(true)}
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
                                className={mypagePaginationBtnClass(
                                  Math.min(myListNewSongsPage, myListNewSongsTotalPages) === slot,
                                )}
                              >
                                {slot}
                              </button>
                            ),
                          )}
                          <button
                            type="button"
                            disabled={Math.min(myListNewSongsPage, myListNewSongsTotalPages) >= myListNewSongsTotalPages}
                            onClick={() => setMyListNewSongsPage((p) => Math.min(myListNewSongsTotalPages, p + 1))}
                            className={mypageSecondaryBtnClass(true)}
                          >
                            →
                          </button>
                        </nav>
                      ) : null}
                    </div>
                  )}
                    </div>
                    <div className="min-w-0 shrink-0 lg:sticky lg:top-2 lg:w-[min(100%,28rem)] xl:w-[min(100%,32rem)]">
                      <MyPageMusicPreviewPanel
                        selection={musicPreview}
                        onPickSong={pickSongFromMyList}
                        hideAddToMyList
                      />
                    </div>
                  </div>
                </>
              ) : null}
              {myListTab === 'artists' ? (
                <div className={mypagePanelClass()}>
                  <h3 className={mypageSectionTitleClass()}>保存済みアーティスト</h3>
                  <p className={`mt-1 text-xs ${mypageBodyTextClass()}`}>
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
                            className={`min-w-[1.75rem] ${libraryIndexLetterBtnClass(myListArtistFilterLetter === key)}`}
                          >
                            {key}
                          </button>
                        ))}
                      </nav>
                      <div
                        className={`mt-2 max-h-[min(50vh,28rem)] overflow-y-auto rounded border pr-0.5 ${
                          IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-800/60'
                        }`}
                      >
                        <ul className="space-y-1">
                          {filteredLibraryArtists.map((a) => {
                            const open = myListLibraryArtistExpandedId === a.id;
                            const effectiveSlug = a.artist_slug ?? buildArtistSlugForProfile(a.display_name);
                            return (
                              <li
                                key={a.id}
                                className={
                                  IS_MC_PRODUCT
                                    ? 'rounded border border-gray-200 bg-white'
                                    : 'rounded border border-gray-700/80 bg-gray-800/40'
                                }
                              >
                                <div className="flex items-center gap-2 px-2 py-2">
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() =>
                                      setMyListLibraryArtistExpandedId((prev) => (prev === a.id ? null : a.id))
                                    }
                                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm hover:opacity-90 ${
                                      IS_MC_PRODUCT ? 'text-gray-800' : 'text-gray-200 hover:text-white'
                                    }`}
                                  >
                                    <span className="min-w-0 truncate font-medium">
                                      {a.display_name}
                                      <span className={`ml-1 font-normal ${IS_MC_PRODUCT ? 'text-gray-500' : 'text-gray-400'}`}>
                                        （{a.linked_count}）
                                      </span>
                                    </span>
                                    <span className={mypageSecondaryBtnClass(true)}>
                                      {open ? '曲一覧▲' : '曲一覧▼'}
                                    </span>
                                  </button>
                                  {effectiveSlug ? (
                                    <button
                                      type="button"
                                      onClick={() => openMyListArtistProfile(a.display_name, effectiveSlug)}
                                      className={mypageSecondaryBtnClass(true)}
                                      title="アーティスト情報を表示"
                                    >
                                      PROFILE
                                    </button>
                                  ) : null}
                                </div>
                                {open ? (
                                  <ul
                                    className={`space-y-2 border-t px-2 py-2 ${
                                      IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-700/80'
                                    }`}
                                  >
                                    {a.items.length === 0 ? (
                                      <li className="text-xs text-gray-500">紐づく曲がありません。</li>
                                    ) : (
                                      a.items.map((it) => (
                                        <li
                                          key={`${a.id}-${it.id}-${it.position}`}
                                          className={
                                            IS_MC_PRODUCT
                                              ? 'rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-700'
                                              : 'rounded bg-gray-900/50 px-2 py-1.5 text-xs text-gray-300'
                                          }
                                        >
                                          <p className={`font-medium ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-gray-200'}`}>
                                            {it.title?.trim() || it.video_id}
                                            {it.artist?.trim() ? ` / ${it.artist.trim()}` : ''}
                                          </p>
                                          <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <a
                                              href={it.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className={`break-all hover:underline ${IS_MC_PRODUCT ? 'text-blue-600' : 'text-blue-400'}`}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              YouTube で開く
                                            </a>
                                            <button
                                              type="button"
                                              className={mypagePickSongBtnClass()}
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

        {mainTab === 'participation' ? (
          <div className={`mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto ${mypageSectionBorderClass()} pt-4`}>
            <p className={`mb-3 text-xs leading-relaxed ${mypageBodyTextClass()}`}>
              {IS_MC_PRODUCT
                ? 'ログイン状態で入室した会の参加履歴です。入室・退出時刻と滞在時間を確認できます。'
                : 'ログイン状態で入室した会の参加履歴です。入室時刻・退出時刻に加え、AI 利用量の目安を表示します。'}
              {!IS_MC_PRODUCT ? (
                <span className="mt-1 block text-emerald-300/90">
                  【現在無料】AI 機能はサイト管理者負担で提供されており、参加者への請求はありません。
                </span>
              ) : null}
            </p>
            {!IS_MC_PRODUCT ? (
              <div className="mb-4 rounded border border-emerald-900/40 bg-emerald-950/20 p-3 text-xs leading-relaxed">
                <p className="text-sm font-medium text-emerald-100/95">{AI_CREDITS_BILLING_SUMMARY_TITLE}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-gray-300">
                  {AI_CREDITS_BILLING_SUMMARY_LINES.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[11px] text-gray-500">{AI_CREDITS_BILLING_SUMMARY_FOOTNOTE}</p>
              </div>
            ) : null}
            {!IS_MC_PRODUCT && !isGuest ? (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-gray-300">{AI_TRIAL_STATUS_MYPAGE_HEADING}</p>
                <AiTrialStatusBadge
                  status={aiTrialStatus}
                  loading={aiTrialState === 'loading'}
                  variant="mypage"
                />
              </div>
            ) : null}
            {!IS_MC_PRODUCT && geminiUsageLoading ? (
              <p className="mb-3 text-xs text-gray-500">AI 利用量を読み込み中…</p>
            ) : !IS_MC_PRODUCT && geminiUsageSummary?.enabled === false && geminiUsageSummary.hint ? (
              <p className="mb-3 rounded border border-amber-900/50 bg-amber-950/30 px-2 py-1.5 text-xs text-amber-200/90">
                AI 利用量: {geminiUsageSummary.hint}
              </p>
            ) : null}
            {!IS_MC_PRODUCT && !geminiUsageLoading && geminiUsageSummary?.enabled && (
              <div className="mb-4 rounded border border-violet-800/50 bg-violet-950/20 p-3">
                <p className="text-xs font-medium text-violet-200">
                  月次 AI 利用（請求先としてあなたに帰属）
                </p>
                {currentMonthGeminiUsage && currentMonthGeminiUsage.calls > 0 ? (
                  <p className="mt-1 text-sm text-gray-100">
                    今月: {currentMonthGeminiUsage.calls} 回 · 入力{' '}
                    {formatTokenCount(currentMonthGeminiUsage.promptTokens)} · 出力{' '}
                    {formatTokenCount(currentMonthGeminiUsage.outputTokens)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">今月の記録はまだありません。</p>
                )}
                {currentMonthPersonalByCategory &&
                Object.values(currentMonthPersonalByCategory).some((c) => c.calls > 0) ? (
                  <GeminiUsageCategoryBreakdown
                    byCategory={currentMonthPersonalByCategory}
                    title="今月 · あなたの操作"
                    className="mt-3 border-t border-violet-900/40 pt-3"
                  />
                ) : currentMonthGeminiByCategory &&
                  Object.values(currentMonthGeminiByCategory).some((c) => c.calls > 0) ? (
                  <GeminiUsageCategoryBreakdown
                    byCategory={currentMonthGeminiByCategory}
                    title="今月の種別内訳"
                    className="mt-3 border-t border-violet-900/40 pt-3"
                  />
                ) : geminiUsageSummary.byCategory &&
                  Object.values(geminiUsageSummary.byCategory).some((c) => c.calls > 0) ? (
                  <GeminiUsageCategoryBreakdown
                    byCategory={geminiUsageSummary.byCategory}
                    title="種別内訳（直近120日）"
                    className="mt-3 border-t border-violet-900/40 pt-3"
                  />
                ) : null}
                {roomCommonGeminiHasData &&
                currentMonthRoomCommonByCategory &&
                Object.values(currentMonthRoomCommonByCategory).some((c) => c.calls > 0) ? (
                  <div className="mt-3 border-t border-amber-900/40 pt-3">
                    <p className="text-xs font-medium text-amber-200/90">
                      {AI_USAGE_DISCLOSURE_MYPAGE_ROOM_COMMON}
                    </p>
                    <GeminiUsageCategoryBreakdown
                      byCategory={currentMonthRoomCommonByCategory}
                      title="今月 · 部屋共通"
                      compact
                      className="mt-2"
                    />
                  </div>
                ) : null}
                {(geminiUsageSummary.monthly?.length ?? 0) > 1 ? (
                  <ul className="mt-2 space-y-1 border-t border-violet-900/40 pt-2 text-xs text-gray-400">
                    {(geminiUsageSummary.monthly ?? [])
                      .filter((m) => m.monthKey !== currentMonthGeminiUsage?.monthKey)
                      .slice(0, 5)
                      .map((m) => (
                        <li key={m.monthKey}>
                          {m.monthLabel}: {m.calls} 回 · 入力 {formatTokenCount(m.promptTokens)} · 出力{' '}
                          {formatTokenCount(m.outputTokens)}
                        </li>
                      ))}
                  </ul>
                ) : null}
                <p className="mt-2 text-xs leading-relaxed text-gray-400">{AI_USAGE_DISCLOSURE_MYPAGE_PARTICIPATION}</p>
              </div>
            )}
            {!isGuest ? (
              <HostedGatheringPlaybackSection
                enabled
                musicPreview={musicPreview}
                onPlayPreview={openSongHistoryPreview}
                onViewCommentary={openSongHistoryCommentary}
                onPickSong={pickSongFromMyList}
                onAddToMyList={addSongHistoryToMyList}
                onAddToMyListFromPreview={(payload) => void addToMyListFromPreview(payload, 'song_history')}
                myListAddBusy={myListAddBusy}
                focusAiCommentary={focusAiCommentary}
                onFocusAiCommentaryHandled={() => setFocusAiCommentary(false)}
                onClearPreview={() => {
                  setMusicPreview(null);
                  setFocusAiCommentary(false);
                }}
              />
            ) : null}
            {participationLoading ? (
              <p className="text-sm text-gray-500">読み込み中…</p>
            ) : participationSummaryRows.length === 0 ? (
              <p className="text-sm text-gray-500">参加履歴はまだありません。</p>
            ) : (
              <>
                <div className="space-y-3">
                  {participationPageRows.map((row) => {
                    const joinedStr = new Date(row.first_joined_ms).toLocaleString('ja-JP');
                    const leftStr = row.last_left_ms
                      ? new Date(row.last_left_ms).toLocaleString('ja-JP')
                      : '在室中 / 未取得';
                    const slotKey = participationSummaryKey(row);
                    const slotUsage = geminiUsageSummary?.bySlot?.[slotKey] ?? null;
                    const slotCategoryUsage = geminiUsageSummary?.bySlotCategory?.[slotKey] ?? null;
                    const slotPersonalUsage = geminiUsageSummary?.personal?.bySlot?.[slotKey] ?? null;
                    const slotRoomCommonUsage = geminiUsageSummary?.roomCommon?.bySlot?.[slotKey] ?? null;
                    const slotSongCount = participationSongCountByKey.get(slotKey) ?? 0;
                    return (
                      <div
                        key={`${row.slotStartMs}-${row.room_id}`}
                        className={mypagePanelClass()}
                      >
                        <p className={`text-xs ${IS_MC_PRODUCT ? 'text-gray-600' : 'text-amber-200'}`}>
                          {row.slotLabel}
                        </p>
                        <p className="text-xs text-gray-500">
                          部屋 {row.room_id || '—'} · {row.gathering_title || '部屋の名前未設定'}
                        </p>
                        {row.display_name ? (
                          <p className="text-xs text-gray-400">表示名（入室時）: {row.display_name}</p>
                        ) : null}
                        <p className="text-sm text-gray-200">最初の入室: {joinedStr}</p>
                        <p className="text-xs text-gray-400">最後の退出: {leftStr}</p>
                        <p className="text-xs text-emerald-300">滞在合計: {formatDurationJa(row.total_stay_ms)}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setMusicPreview(null);
                            setFocusAiCommentary(false);
                            setParticipationSongModalSlot(row);
                          }}
                          className={IS_MC_PRODUCT ? mypageSecondaryBtnClass(true) : 'mt-2 rounded border border-sky-700/60 bg-sky-900/30 px-2.5 py-1 text-xs font-medium text-sky-200 hover:bg-sky-900/50'}
                        >
                          選曲リスト（{slotSongCount} 曲）
                        </button>
                        {!IS_MC_PRODUCT && geminiUsageSummary?.enabled ? (
                          slotUsage && slotUsage.calls > 0 ? (
                            <>
                              <p className="mt-1 text-xs text-violet-200">
                                AI 利用: {slotUsage.calls} 回 · 入力 {formatTokenCount(slotUsage.promptTokens)} · 出力{' '}
                                {formatTokenCount(slotUsage.outputTokens)}
                              </p>
                              {slotPersonalUsage && slotPersonalUsage.calls > 0 && slotRoomCommonUsage &&
                              slotRoomCommonUsage.calls > 0 ? (
                                <p className="mt-0.5 text-xs text-gray-400">
                                  内訳: あなたの操作 {slotPersonalUsage.calls} 回 · 部屋共通{' '}
                                  {slotRoomCommonUsage.calls} 回
                                </p>
                              ) : null}
                              {slotCategoryUsage ? (
                                <GeminiUsageCategoryBreakdown
                                  byCategory={slotCategoryUsage}
                                  title=""
                                  compact
                                  className="mt-1"
                                />
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-1 text-xs text-gray-600">AI 利用: 記録なし</p>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {participationTotalPages > 1 ? (
                  <nav
                    className="mt-3 flex flex-wrap items-center justify-center gap-1 border-t border-gray-700/50 pt-2 text-xs"
                    aria-label="参加履歴のページ送り"
                  >
                    <button
                      type="button"
                      disabled={Math.min(participationPage, participationTotalPages) <= 1}
                      onClick={() => setParticipationPage((p) => Math.max(1, p - 1))}
                      className={mypageSecondaryBtnClass(true)}
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
                      className={mypageSecondaryBtnClass(true)}
                    >
                      →
                    </button>
                  </nav>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {!IS_MC_PRODUCT && mainTab === 'questionHistory' ? (
          <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto border-t border-gray-800 pt-4">
            <p className="mb-3 text-xs leading-relaxed text-gray-400">
              部屋で送った <span className="text-gray-300">@ 質問</span> と AI の回答です。お試し枠の{' '}
              <span className="text-gray-300">@質問 残数</span> は参加履歴タブでも確認できます。
            </p>
            {!isGuest ? (
              <div className="mb-4">
                <AiTrialStatusBadge
                  status={aiTrialStatus}
                  loading={aiTrialState === 'loading'}
                  variant="compact"
                />
              </div>
            ) : null}
            <UserAtQuestionHistory isGuest={isGuest} />
          </div>
        ) : null}
      </div>

      {participationSongModalSlot ? (
        <ParticipationSongHistoryModal
          slot={participationSongModalSlot}
          songs={participationModalSongs}
          loading={songHistoryLoading}
          musicPreview={musicPreview}
          onPlayPreview={openSongHistoryPreview}
          onViewCommentary={openSongHistoryCommentary}
          onPickSong={pickSongFromMyList}
          onAddToMyList={addSongHistoryToMyList}
          onAddToMyListFromPreview={(payload) => void addToMyListFromPreview(payload, 'song_history')}
          myListAddBusy={myListAddBusy}
          focusAiCommentary={focusAiCommentary}
          onFocusAiCommentaryHandled={() => setFocusAiCommentary(false)}
          onClose={() => {
            setParticipationSongModalSlot(null);
            setMusicPreview(null);
            setFocusAiCommentary(false);
          }}
        />
      ) : null}

      {myListArtistProfileOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="アーティスト情報"
        >
          <div
            className={
              IS_MC_PRODUCT
                ? 'max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl'
                : 'max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-4'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className={mypageSectionTitleClass()}>
                アーティスト情報
                <span className={`ml-2 text-xs font-normal ${mypageBodyTextClass()}`}>{myListArtistProfileName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMyListArtistProfileOpen(false)}
                className={mypageSecondaryBtnClass()}
              >
                閉じる
              </button>
            </div>
            <div className={mypagePanelClass()}>
              <MainArtistTabPanel
                artistName={myListArtistProfileSlug || myListArtistProfileName}
                songTitle={null}
              />
            </div>
          </div>
        </div>
      )}
    </MyPageModalFrame>
  );
}
