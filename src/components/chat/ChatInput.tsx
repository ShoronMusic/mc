'use client';

/**
 * メッセージ入力欄（送信 / YouTube URL のときは動画再生に転送）
 */

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MAX_MESSAGE_LENGTH } from '@/lib/chat-limits';
import { MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT } from '@/lib/musicai-extension-events';
import { SHARE_SET_CHAT_TEXT_EVENT } from '@/lib/share-target-delivery';
import { consumePendingShareChatText } from '@/lib/share-target-pending';
import { NON_YOUTUBE_URL_SYSTEM_MESSAGE } from '@/lib/chat-non-youtube-url';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import type { AiTrialStatus } from '@/lib/ai-trial-status';
import {
  resolveAiSelectionMode,
  shouldShowAiDualSelectionButtons,
  type AiSelectionMode,
} from '@/lib/ai-selection-mode';
import { postMyListItemClient } from '@/lib/my-list-client-post';
import type { SystemMessageOptions } from '@/types/chat';
import { isAiQuestionGuardDisabledClient } from '@/lib/chat-system-copy';
import {
  ArrowPathIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  FolderIcon,
  MusicalNoteIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { SongSelectionHowtoModal } from '@/components/chat/SongSelectionHowtoModal';
import { LibraryArtistDetailMusic8Body } from '@/components/chat/LibraryArtistDetailMusic8Body';
import { isLibraryArtistInfoSparse } from '@/lib/library-artist-info-display';
import { LibraryMusic8SongComment } from '@/components/chat/LibraryMusic8SongComment';
import {
  LibrarySongArtistsDetail,
  useLibrarySongArtists,
} from '@/components/chat/LibrarySongArtistsDetail';
import type { Music8ArtistJson } from '@/lib/music8-artist-display';
import { isYoutubeKeywordSearchEnabled } from '@/lib/youtube-keyword-search-ui';
import { useIsLgViewport } from '@/hooks/useLgViewport';
import { useIsMobileLandscapeViewport } from '@/hooks/useMobileLandscapeViewport';
import {
  expandMainArtistNamesForLibraryFilter,
  songMainArtistIncludesArtist,
  dedupeLibraryArtistDisplayNames,
  mergeLibraryArtistIndexItems,
  artistNamesMatchIgnoringLeadingArticle,
} from '@/lib/library-search-query';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';

type SearchResultRow = {
  videoId: string;
  title: string;
  channelTitle: string;
  artistTitle: string;
  publishedAt?: string;
  thumbnailUrl?: string;
};

type LibrarySongRow = {
  id: string;
  title: string;
  song_title: string | null;
  main_artist: string | null;
  style: string | null;
  genres: string | null;
  vocal: string | null;
  play_count: number | null;
  my_play_count: number | null;
  original_release_date: string | null;
  spotify_popularity: number | null;
  video_id: string | null;
};

type LibrarySongVideoRow = {
  video_id: string;
  variant: string | null;
};

type LibraryArtistInfo = {
  id: string;
  name: string;
  name_ja: string | null;
  kind: string | null;
  origin_country: string | null;
  active_period: string | null;
  members: string | null;
  image_url: string | null;
  image_credit: string | null;
  profile_text: string | null;
};

/** `/api/library/artists` と同型（部屋ライブラリの索引） */
type LibraryArtistIndexRow = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

/** マイページのマイライブラリ索引と同じ規則（The … を除く・先頭1文字で A–Z / # / その他） */
const LIBRARY_MODAL_INDEX_HASH = '#';
const LIBRARY_MODAL_INDEX_OTHER = 'その他';

function LibraryArtistListLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 ${compact ? 'py-6' : 'px-2 py-8'}`}
      role="status"
      aria-live="polite"
      aria-label="アーティスト一覧を読み込み中"
    >
      <ArrowPathIcon
        className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} shrink-0 animate-spin text-lime-400/90`}
        aria-hidden
      />
      <span className={`${compact ? 'text-xs' : 'text-[11px]'} text-lime-200/70`}>読み込み中…</span>
    </div>
  );
}

function LibrarySongListLoading() {
  return (
    <div
      className="flex items-center justify-center gap-2 px-2 py-14"
      role="status"
      aria-live="polite"
      aria-label="曲一覧を読み込み中"
    >
      <ArrowPathIcon className="h-6 w-6 shrink-0 animate-spin text-violet-400/90" aria-hidden />
      <span className="text-xs text-violet-200/75">曲一覧を読み込み中…</span>
    </div>
  );
}

/** 部屋ライブラリ・モバイルでどの段を主表示にするか */
type LibraryMobileFocus = 'idle' | 'artists' | 'songs' | 'split';

function resolveLibraryMobileFocus(input: {
  libraryArtistIndexActive: boolean;
  librarySelectedArtistName: string | null;
  librarySelectedSongId: string | null;
  hasSelectedLibraryRow: boolean;
  librarySongSource: 'idle' | 'browse' | 'search';
  libraryQuery: string;
}): LibraryMobileFocus {
  if (input.hasSelectedLibraryRow && input.librarySelectedSongId) return 'split';
  if (
    input.librarySelectedArtistName ||
    input.librarySongSource === 'browse' ||
    (input.librarySongSource === 'search' && input.libraryQuery.trim() !== '')
  ) {
    return 'songs';
  }
  if (input.libraryArtistIndexActive) return 'artists';
  return 'idle';
}

function libraryMobileArtistListSectionExtra(focus: LibraryMobileFocus, isMobileLandscape: boolean): string {
  if (isMobileLandscape) {
    return 'max-lg:flex-1 max-lg:min-h-0 max-lg:max-h-none';
  }
  switch (focus) {
    case 'artists':
      return 'max-lg:flex-1 max-lg:min-h-0 max-lg:max-h-none';
    case 'songs':
      return 'max-lg:max-h-[24vh] max-lg:shrink-0';
    case 'split':
      return 'max-lg:hidden';
    default:
      return 'max-lg:max-h-[28vh] max-lg:shrink-0';
  }
}

function libraryMobileArtistDetailSectionExtra(focus: LibraryMobileFocus, isMobileLandscape: boolean): string {
  if (isMobileLandscape) return 'max-lg:hidden';
  return focus === 'idle' ? 'max-lg:max-h-[18vh] max-lg:shrink-0' : 'max-lg:hidden';
}

function libraryMobileSongListSectionExtra(focus: LibraryMobileFocus, isMobileLandscape: boolean): string {
  if (isMobileLandscape) {
    return 'max-lg:flex-1 max-lg:min-h-0 max-lg:max-h-none';
  }
  switch (focus) {
    case 'artists':
    case 'idle':
      return 'max-lg:max-h-[20vh] max-lg:shrink-0';
    case 'songs':
      return 'max-lg:flex-1 max-lg:min-h-0 max-lg:max-h-none';
    case 'split':
      return 'max-lg:flex-1 max-lg:min-h-0 max-lg:max-h-none max-lg:basis-1/2';
    default:
      return '';
  }
}

function libraryModalArtistNameForIndexing(name: string | null): string {
  const t = (name ?? '').trim();
  const m = /^the\s+/i.exec(t);
  if (m) return t.slice(m[0].length).trimStart();
  return t;
}

function libraryModalArtistIndexKey(name: string | null): string {
  const t = libraryModalArtistNameForIndexing(name);
  if (!t) return LIBRARY_MODAL_INDEX_OTHER;
  const c0 = t[0];
  if (c0 >= 'A' && c0 <= 'Z') return c0;
  if (c0 >= 'a' && c0 <= 'z') return c0.toUpperCase();
  if (c0 >= '0' && c0 <= '9') return LIBRARY_MODAL_INDEX_HASH;
  return LIBRARY_MODAL_INDEX_OTHER;
}

/** 索引の `main_artist` 表記に合わせる（DaBaby → Dababy、Beatles → The Beatles など） */
function resolveLibraryMainArtistName(
  name: string,
  items: { main_artist: string }[],
): string {
  const n = name.trim();
  if (!n) return n;
  return findLibraryMainArtistInIndex([n], items) ?? n;
}

function sortLibraryModalLetterKeys(keys: string[]): string[] {
  const rank = (k: string): number => {
    if (k === LIBRARY_MODAL_INDEX_OTHER) return 1002;
    if (k === LIBRARY_MODAL_INDEX_HASH) return 1001;
    if (/^[A-Z]$/.test(k)) return k.charCodeAt(0);
    return 1000;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'));
}

/**
 * 左サイド索引：数字・記号バケット（1ボタン）、続けて A–Z、その他。
 * API の indexLetter は 0–9 が別要素になり得るため # に束ねる。
 */
function buildRoomLibrarySidebarLetters(raw: string[]): string[] {
  const hasHashBucket = raw.some(
    (x) =>
      x === LIBRARY_MODAL_INDEX_HASH ||
      (x.length === 1 && x >= '0' && x <= '9'),
  );
  const aToZ = raw
    .filter((x) => /^[A-Z]$/.test(x))
    .sort((a, b) => a.localeCompare(b, 'en'));
  const hasOther = raw.includes(LIBRARY_MODAL_INDEX_OTHER);
  const out: string[] = [];
  if (hasHashBucket) out.push(LIBRARY_MODAL_INDEX_HASH);
  out.push(...aToZ);
  if (hasOther) out.push(LIBRARY_MODAL_INDEX_OTHER);
  return out;
}

/** 索引 API 未取得時も A–Z / 0–9 を即表示する（クリックまで一覧は読まない） */
const STATIC_ROOM_LIBRARY_SIDEBAR_LETTERS = buildRoomLibrarySidebarLetters([
  LIBRARY_MODAL_INDEX_HASH,
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  LIBRARY_MODAL_INDEX_OTHER,
]);

/** 部屋ライブラリ・モバイル縦積みの3段（アーティスト一覧 / 詳細 / 曲一覧） */
const LIBRARY_MOBILE_PANEL = {
  stepBadge:
    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums text-white shadow-sm',
  artistList: {
    section:
      'max-lg:overflow-hidden max-lg:rounded-lg max-lg:border-2 max-lg:border-lime-600/55 max-lg:bg-lime-950/55 max-lg:shadow-[inset_0_1px_0_0_rgba(163,230,53,0.12)] max-lg:flex max-lg:flex-col',
    header:
      'max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:border-b max-lg:border-lime-600/45 max-lg:bg-lime-900/75 max-lg:px-3 max-lg:py-2.5',
    badge: 'bg-lime-600',
    title: 'max-lg:text-xs max-lg:font-semibold max-lg:text-lime-50',
    body: 'max-lg:bg-lime-950/35',
  },
  artistDetail: {
    section:
      'max-lg:overflow-hidden max-lg:rounded-lg max-lg:border-2 max-lg:border-sky-600/50 max-lg:bg-sky-950/50 max-lg:shadow-[inset_0_1px_0_0_rgba(56,189,248,0.1)] max-lg:flex max-lg:flex-col',
    header:
      'max-lg:border-sky-600/40 max-lg:bg-sky-900/60 max-lg:px-3 max-lg:py-2.5',
    badge: 'bg-sky-600',
    title: 'max-lg:text-xs max-lg:font-semibold max-lg:text-sky-50',
    body: 'max-lg:bg-sky-950/30',
  },
  songList: {
    section:
      'max-lg:overflow-hidden max-lg:rounded-lg max-lg:border-2 max-lg:border-violet-600/50 max-lg:bg-violet-950/45 max-lg:shadow-[inset_0_1px_0_0_rgba(167,139,250,0.1)] max-lg:flex max-lg:flex-col',
    header:
      'max-lg:border-violet-600/40 max-lg:bg-violet-900/55 max-lg:px-3 max-lg:py-2.5',
    badge: 'bg-violet-600',
    title: 'max-lg:text-xs max-lg:font-semibold max-lg:text-violet-50',
    body: 'max-lg:bg-violet-950/25 max-lg:p-2',
  },
} as const;

/** タブ画像 PNG の表示サイズ（元画像高さ 44px 前提） */
const LIBRARY_TAB_IMAGE_HEIGHT_PX = 24;
const LIBRARY_TAB_IMAGE_NATIVE_HEIGHT_PX = 44;
const LIBRARY_TAB_B_DISPLAY_WIDTH_PX = Math.round(
  (108 / LIBRARY_TAB_IMAGE_NATIVE_HEIGHT_PX) * LIBRARY_TAB_IMAGE_HEIGHT_PX,
);

type LibrarySectionId = 'search';

/** A 検索セクションラベル */
const LIBRARY_SECTION_BADGE: Record<LibrarySectionId, { letter: string; border: string; text: string }> = {
  search: { letter: 'A', border: 'border-amber-400/95', text: 'text-amber-300' },
};

function LibrarySectionBadge({
  section,
  small = false,
  title,
}: {
  section: LibrarySectionId;
  small?: boolean;
  title?: string;
}) {
  const { letter, border, text } = LIBRARY_SECTION_BADGE[section];
  const box = small ? 'h-4 min-w-4 text-[8px]' : 'h-5 min-w-5 text-[10px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border-2 bg-gray-950/90 font-bold tabular-nums leading-none ${box} ${border} ${text}`}
      title={title}
      aria-hidden
    >
      {letter}
    </span>
  );
}

type LibraryTabImageId = 'index' | 'artistList' | 'artistDetail' | 'songList' | 'songDetail';

const LIBRARY_TAB_IMAGE: Record<
  LibraryTabImageId,
  { color: string; off?: string; title: string }
> = {
  index: { color: '/images/library_tab_b.png', title: 'B：A–Z 索引' },
  artistList: {
    color: '/images/library_tab_c.png',
    off: '/images/library_tab_c_off.png',
    title: 'C：アーティスト一覧',
  },
  artistDetail: {
    color: '/images/library_tab_d.png',
    off: '/images/library_tab_d_off.png',
    title: 'D：アーティスト詳細',
  },
  songList: {
    color: '/images/library_tab_e.png',
    off: '/images/library_tab_e_off.png',
    title: 'E：曲一覧',
  },
  songDetail: {
    color: '/images/library_tab_f.png',
    off: '/images/library_tab_f_off.png',
    title: 'F：曲詳細',
  },
};

function LibrarySectionTabImage({
  section,
  active = true,
  small = false,
}: {
  section: LibraryTabImageId;
  active?: boolean;
  small?: boolean;
}) {
  const { color, off, title } = LIBRARY_TAB_IMAGE[section];
  const src = active || !off ? color : off;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={title}
      aria-hidden
      className="w-auto shrink-0 object-contain object-left"
      style={{ height: LIBRARY_TAB_IMAGE_HEIGHT_PX }}
    />
  );
}

/** ライブラリ未操作時：A 検索 / B A–Z 索引の案内 */
function LibraryEntryGuide({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-lime-700/45 bg-lime-950/35 px-3 py-3 ${className}`}
      role="note"
      aria-label="ライブラリの使い方"
    >
      <p className="mb-2.5 text-xs font-semibold text-lime-100/90">はじめに</p>
      <ol className="space-y-2.5">
        <li className="flex items-start gap-2 text-[11px] leading-snug text-gray-300">
          <LibrarySectionBadge section="search" />
          <span>
            上の<strong className="font-medium text-gray-200">検索欄</strong>
            にアーティスト名・曲名を入れて「検索」
          </span>
        </li>
        <li className="flex items-start gap-2 text-[11px] leading-snug text-gray-300">
          <LibrarySectionTabImage section="index" />
          <span>
            <strong className="font-medium text-gray-200 lg:hidden">アルファベット索引</strong>
            <strong className="hidden font-medium text-gray-200 lg:inline">左の A–Z</strong>
            から頭文字を選び、アーティストを探す
          </span>
        </li>
      </ol>
    </div>
  );
}

function libraryArtistIndexLetterMatchesSidebarKey(indexLetter: string, sidebarKey: string | null): boolean {
  if (sidebarKey === null) return true;
  if (sidebarKey === LIBRARY_MODAL_INDEX_HASH) {
    return (
      indexLetter === LIBRARY_MODAL_INDEX_HASH ||
      (indexLetter.length === 1 && indexLetter >= '0' && indexLetter <= '9')
    );
  }
  return indexLetter === sidebarKey;
}

function libraryVariantLabel(variant: string | null): string {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return '公式';
  if (v === 'lyric') return 'リリック';
  if (v === 'live') return 'ライブ';
  if (v === 'topic') return 'Topic';
  if (!v) return 'その他';
  return v;
}

/** DB `original_release_date`（YYYY-MM[-DD] 等）を一覧用 YYYY.MM.DD / YYYY.MM 表記へ */
function formatLibraryReleaseDot(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  return d ? `${y}.${mo}.${d}` : `${y}.${mo}`;
}

function parseReleaseDateMsForSort(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const d = m[3] ? Number.parseInt(m[3], 10) : 1;
  const t = Date.UTC(y, mo - 1, d);
  return Number.isFinite(t) ? t : null;
}

/** 曲一覧1行目: `song_title` があればそれのみ、なければ表示タイトル */
function librarySongListPrimaryTitle(row: LibrarySongRow): string {
  const st = (row.song_title ?? '').trim();
  if (st) return st;
  return row.title;
}

export interface ChatInputHandle {
  /** 入力欄の末尾に文字列を追加する（参加者名クリック用） */
  insertText: (text: string) => void;
  /**
   * 発言欄にキーワードを入れたうえで、既存の YouTube 検索モーダルと同じ API 検索を実行する
   * （AI メッセージの「シングル：」行などから呼ぶ）
   */
  searchYoutubeWithQuery: (query: string) => void;
  /** ライブラリモーダルを開き、索引の `main_artist` を選択した状態にする */
  openLibraryForArtist: (
    mainArtist: string,
    options?: { music8Artist?: Music8ArtistJson | null },
  ) => void;
  /** 部屋ライブラリモーダルを開く（選曲案内リンク用） */
  openLibrary: () => void;
}

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onVideoUrl?: (
    url: string,
    opts?: {
      themePlaylistThemeId?: string | null;
      themePlaylistThemeLabel?: string | null;
      aiMode?: AiSelectionMode;
    },
  ) => void;
  /** ゲスト時は検索APIの制限を低めにするために送る */
  isGuest?: boolean;
  /** AI お試し残数（二段選曲ボタン用） */
  aiTrialStatus?: AiTrialStatus | null;
  /** 視聴専用（選曲に参加しない） */
  participatesInSelection?: boolean;
  /** ゲストが AI 付き選曲を試したとき */
  onGuestAiSelectionBlocked?: () => void;
  onSystemMessage?: (text: string, opts?: SystemMessageOptions) => void;
  /** 検索結果から「候補リスト」に追加するためのコールバック（任意） */
  onAddCandidate?: (row: SearchResultRow) => void;
  /** プレビュー開始（メイン再生の音を下げる用途など） */
  onPreviewStart?: (videoId: string) => void;
  /** プレビュー終了（メイン再生の音を戻す用途など） */
  onPreviewStop?: () => void;
  /** 送信・検索と同じ行の右側（モバイルは3段目の横並び）。例: 候補リスト */
  trailingSlot?: ReactNode;
  /** この端末の AI 質問ガード警告・入室制限ストレージを消す（親で room 連動の state も直す） */
  onClearLocalAiQuestionGuard?: () => void;
  /** モバイル下段リンク: 利用規約を開く */
  onOpenTerms?: () => void;
  /** モバイル下段リンク: サイトご意見を開く */
  onOpenSiteFeedback?: () => void;
  /**
   * マイページで進行中のお題ミッションがあるときのみ渡す。
   * 送信ボタンの上に「お題曲送信」が出現し、そのボタン経由でのみ themeId を付与する。
   */
  themePlaylistRoomSubmit?: { themeId: string; themeLabel: string } | null;
  /** 別端末が同一アカウントで操作中のため、この端末では送信・選曲不可 */
  roomInteractionLocked?: boolean;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSendMessage,
    onVideoUrl,
    isGuest = false,
    aiTrialStatus = null,
    participatesInSelection = true,
    onGuestAiSelectionBlocked,
    onSystemMessage,
    onAddCandidate,
    onPreviewStart,
    onPreviewStop,
    trailingSlot,
    onClearLocalAiQuestionGuard,
    onOpenTerms,
    onOpenSiteFeedback,
    themePlaylistRoomSubmit = null,
    roomInteractionLocked = false,
  },
  ref
) {
  const [value, setValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
  const [aiQuestionExamplesOpen, setAiQuestionExamplesOpen] = useState(false);
  const [songHowtoOpen, setSongHowtoOpen] = useState(false);
  const [themePlaylistConfirmOpen, setThemePlaylistConfirmOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  /** 索引モード: 日本語名（artists.name_ja）から解決した main_artist 候補 */
  const [libraryJaMainArtistMatches, setLibraryJaMainArtistMatches] = useState<string[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryRows, setLibraryRows] = useState<LibrarySongRow[]>([]);
  /** 索引は DB 全件（管理ライブラリと同じ）。未取得時は検索結果から頭文字を組み立てる */
  const [libraryArtistItems, setLibraryArtistItems] = useState<LibraryArtistIndexRow[]>([]);
  const [libraryIndexLetters, setLibraryIndexLetters] = useState<string[]>([]);
  const [libraryArtistsLoading, setLibraryArtistsLoading] = useState(false);
  const [libraryArtistsError, setLibraryArtistsError] = useState<string | null>(null);
  const [libraryArtistsReady, setLibraryArtistsReady] = useState(false);
  /** false の間はアーティスト一覧を出さない（索引クリックで true） */
  const [libraryArtistIndexActive, setLibraryArtistIndexActive] = useState(false);
  /** idle=索引のみ／browse=アーティスト別全曲API／search=キーワード検索API */
  const [librarySongSource, setLibrarySongSource] = useState<'idle' | 'browse' | 'search'>('idle');
  /** 曲一覧の並べ替え（NEW/OLD=公開日・popularity=Spotify人気降順・title_asc=曲名A-Z） */
  const [librarySongListSort, setLibrarySongListSort] = useState<
    'release_new' | 'release_old' | 'popularity' | 'title_asc'
  >('release_new');
  /** 選択した字母（A–Z / # / その他）。未選択時は null */
  const [libraryArtistLetter, setLibraryArtistLetter] = useState<string | null>(null);
  /** null = アーティスト未選択（レター内の全曲）。指定時は当該アーティスト曲に絞る */
  const [librarySelectedArtistName, setLibrarySelectedArtistName] = useState<string | null>(null);
  const [librarySelectedSongId, setLibrarySelectedSongId] = useState<string | null>(null);
  const [librarySongVideos, setLibrarySongVideos] = useState<LibrarySongVideoRow[]>([]);
  const [librarySelectedVideoId, setLibrarySelectedVideoId] = useState<string | null>(null);
  const [libraryVideoLoading, setLibraryVideoLoading] = useState(false);
  const [libraryVideoError, setLibraryVideoError] = useState<string | null>(null);
  const isLg = useIsLgViewport();
  const isMobileLandscape = useIsMobileLandscapeViewport();
  const [libraryArtistInfo, setLibraryArtistInfo] = useState<LibraryArtistInfo | null>(null);
  const [libraryArtistInfoLoading, setLibraryArtistInfoLoading] = useState(false);
  const [libraryArtistInfoError, setLibraryArtistInfoError] = useState<string | null>(null);
  /** メインアーティストタブから開いたときの Music8 詳細（DB `artists` が無い場合） */
  const [libraryDetailMusic8Artist, setLibraryDetailMusic8Artist] = useState<Music8ArtistJson | null>(
    null,
  );
  const [libraryLetterModalOpen, setLibraryLetterModalOpen] = useState(false);
  const [libraryCopyState, setLibraryCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [libraryMyListAddBusy, setLibraryMyListAddBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultRow[]>([]);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [watchedVideoIds, setWatchedVideoIds] = useState<string[]>([]);
  const [addedCandidateVideoIds, setAddedCandidateVideoIds] = useState<string[]>([]);
  /** モーダル表示中の「YouTube で全件を見る」用（入力欄を編集してもずれないよう検索実行時に保存） */
  const [youtubeSearchQueryForModal, setYoutubeSearchQueryForModal] = useState('');
  const previewWatchedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const librarySongListScrollRef = useRef<HTMLDivElement | null>(null);
  /** モーダルを閉じる前の曲一覧スクロール位置（閉じて開き直しても維持） */
  const librarySongListScrollTopRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const libraryPreviewActiveRef = useRef(false);
  const aiQuestionExamples = [
    {
      question: '@アヴリル・ラヴィーンのデビュー曲は？',
      answer:
        '「Complicated」です。2002年のアルバム『Let Go』からのリードシングルとして広く知られています。',
    },
    {
      question: '@アヴリル・ラヴィーンのデビュー当時のライバルは？',
      answer:
        '「ライバル」というより、当時のポップ主流（ブリトニー・スピアーズ、クリスティーナ・アギレラ等）と対比される存在でした。',
    },
    {
      question: '@アヴリル・ラヴィーンの人気曲は？',
      answer:
        '代表的には「Complicated」「Sk8er Boi」「My Happy Ending」「Girlfriend」などがよく挙げられます。',
    },
  ] as const;

  const playCandidateAddedSe = useCallback(() => {
    // クリック（ユーザー操作）内で呼ばれるので、ブラウザの自動再生制限を回避しやすい
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx: AudioContext = audioCtxRef.current ?? new AudioCtx();
      audioCtxRef.current = ctx;
      const now = ctx.currentTime;

      const playTone = (freq: number, t0: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        // 発音のエンベロープ（軽やかな短いSE）
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur);
      };

      // C5 -> E5（ワンクリエイティブなチャイム）
      playTone(523.25, now, 0.07);
      playTone(659.25, now + 0.08, 0.07);
    } catch {
      // 音が鳴らなくてもUIは継続
    }
  }, []);

  const runYoutubeKeywordSearch = useCallback(
    async (trimmed: string) => {
      if (!isYoutubeKeywordSearchEnabled()) return;
      if (!trimmed || !onVideoUrl) return;
      const asVideoId = extractVideoId(trimmed);
      if (asVideoId) {
        onVideoUrl(trimmed);
        setValue('');
        return;
      }
      if (isStandaloneNonYouTubeUrl(trimmed)) {
        onSystemMessage?.(NON_YOUTUBE_URL_SYSTEM_MESSAGE);
        return;
      }
      try {
        setSearching(true);
        const res = await fetch('/api/ai/search-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed, maxResults: 5, isGuest }),
        });
        const data = res.ok || res.status === 429 ? await res.json().catch(() => null) : null;
        if (res.status === 429 && data && typeof data === 'object' && data.error === 'rate_limit') {
          onSystemMessage?.(
            typeof data.message === 'string' && data.message.trim()
              ? data.message
              : 'YouTube検索の操作が短時間に集中しています。しばらく待ってから再度お試しください。',
          );
          return;
        }
        if (!res.ok) {
          onSystemMessage?.('検索に失敗しました。しばらくしてから再度お試しください。');
          return;
        }
        if (data?.reason === 'youtube_not_configured') {
          onSystemMessage?.(
            '曲名検索を使うには、サーバーに YOUTUBE_API_KEY の設定が必要です。管理者が設定後、開発サーバー再起動で有効になります。',
          );
        } else {
          const list: SearchResultRow[] = Array.isArray(data?.results)
            ? data.results
                .filter((r: any) => r && typeof r.videoId === 'string')
                .map((r: any) => ({
                  videoId: r.videoId,
                  title: r.title ?? '',
                  channelTitle: r.channelTitle ?? '',
                  artistTitle: r.artistTitle ?? '',
                  publishedAt: typeof r.publishedAt === 'string' ? r.publishedAt : undefined,
                  thumbnailUrl: typeof r.thumbnailUrl === 'string' ? r.thumbnailUrl : undefined,
                }))
            : [];
          if (list.length === 0) {
            onSystemMessage?.('曲が見つかりませんでした。別のキーワードでもう一度お試しください。');
            return;
          }
          setSearchResults(list);
          setWatchedVideoIds([]);
          setAddedCandidateVideoIds([]);
          setYoutubeSearchQueryForModal(trimmed);
          setSearchResultsOpen(true);
        }
      } catch {
        onSystemMessage?.('検索に失敗しました。しばらくしてから再度お試しください。');
      } finally {
        setSearching(false);
      }
    },
    [onVideoUrl, onSystemMessage, isGuest],
  );

  useEffect(() => {
    const onExtensionSetText = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const raw = (e.detail as { text?: unknown })?.text;
      if (typeof raw !== 'string' || !raw.trim()) return;
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
      setValue(text);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT, onExtensionSetText);
    window.addEventListener(SHARE_SET_CHAT_TEXT_EVENT, onExtensionSetText);
    return () => {
      window.removeEventListener(MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT, onExtensionSetText);
      window.removeEventListener(SHARE_SET_CHAT_TEXT_EVENT, onExtensionSetText);
    };
  }, []);

  useEffect(() => {
    const pending = consumePendingShareChatText();
    if (!pending) return;
    const text = pending.slice(0, MAX_MESSAGE_LENGTH);
    setValue(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSubmit = () => {
    if (roomInteractionLocked) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (videoId && onVideoUrl) {
      const aiMode = resolveAiSelectionMode({
        isGuest,
        participatesInSelection,
        aiTrialStatus,
      });
      onVideoUrl(trimmed, { aiMode });
      setValue('');
      return;
    }

    if (isStandaloneNonYouTubeUrl(trimmed)) {
      onSystemMessage?.(NON_YOUTUBE_URL_SYSTEM_MESSAGE);
      return;
    }

    onSendMessage(trimmed);
    setValue('');
  };

  const submitVideoUrl = (mode: AiSelectionMode) => {
    if (roomInteractionLocked || !onVideoUrl) return;
    const trimmed = value.trim();
    if (!extractVideoId(trimmed)) return;
    if (isGuest && mode === 'full') {
      onGuestAiSelectionBlocked?.();
      return;
    }
    const aiMode = resolveAiSelectionMode({
      explicitMode: mode,
      isGuest,
      participatesInSelection,
      aiTrialStatus,
    });
    onVideoUrl(trimmed, { aiMode });
    setValue('');
  };

  const trimmedInput = value.trim();
  const urlVideoIdInInput = extractVideoId(trimmedInput);
  const showDualSongButtons = Boolean(
    onVideoUrl &&
      urlVideoIdInInput &&
      shouldShowAiDualSelectionButtons({ isGuest, participatesInSelection, aiTrialStatus }),
  );

  const openThemePlaylistConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed || !onVideoUrl || !themePlaylistRoomSubmit) return;
    if (!extractVideoId(trimmed)) return;
    setThemePlaylistConfirmOpen(true);
  };

  const confirmThemePlaylistVideoSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || !onVideoUrl || !themePlaylistRoomSubmit) {
      setThemePlaylistConfirmOpen(false);
      return;
    }
    const vid = extractVideoId(trimmed);
    if (!vid) {
      setThemePlaylistConfirmOpen(false);
      return;
    }
    onVideoUrl(trimmed, {
      themePlaylistThemeId: themePlaylistRoomSubmit.themeId,
      themePlaylistThemeLabel: themePlaylistRoomSubmit.themeLabel,
      aiMode: resolveAiSelectionMode({
        explicitMode: 'full',
        isGuest,
        participatesInSelection,
        aiTrialStatus,
      }),
    });
    setValue('');
    setThemePlaylistConfirmOpen(false);
  };

  const handleSearchAndPlay = () => {
    void runYoutubeKeywordSearch(value.trim());
  };

  const loadLibraryRows = useCallback(
    async (rawQuery: string) => {
      setLibraryLoading(true);
      setLibraryError(null);
      try {
        const q = rawQuery.trim();
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('limit', '100');
        const res = await fetch(`/api/library/search?${params.toString()}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setLibraryError(
            typeof data?.error === 'string' ? data.error : 'ライブラリの取得に失敗しました。',
          );
          setLibraryRows([]);
          setLibrarySelectedSongId(null);
          setLibrarySongVideos([]);
          setLibrarySelectedVideoId(null);
          return;
        }
        const rows: LibrarySongRow[] = Array.isArray(data?.items)
          ? data.items
              .filter((r: any) => r && typeof r.id === 'string')
              .map((r: any) => ({
                id: r.id,
                title: typeof r.title === 'string' ? r.title : '（タイトル不明）',
                song_title: typeof r.song_title === 'string' ? r.song_title : null,
                main_artist: typeof r.main_artist === 'string' ? r.main_artist : null,
                style: typeof r.style === 'string' ? r.style : null,
                genres: typeof r.genres === 'string' ? r.genres : null,
                vocal: typeof r.vocal === 'string' ? r.vocal : null,
                play_count: typeof r.play_count === 'number' ? r.play_count : null,
                my_play_count: typeof r.my_play_count === 'number' ? r.my_play_count : null,
                original_release_date:
                  typeof r.original_release_date === 'string' ? r.original_release_date : null,
                spotify_popularity:
                  typeof r.spotify_popularity === 'number' && Number.isFinite(r.spotify_popularity)
                    ? r.spotify_popularity
                    : null,
                video_id: typeof r.video_id === 'string' ? r.video_id : null,
              }))
          : [];
        setLibraryRows(rows);
        setLibrarySelectedSongId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null));
      } catch {
        setLibraryError('ライブラリの取得に失敗しました。');
        setLibraryRows([]);
        setLibrarySelectedSongId(null);
        setLibrarySongVideos([]);
        setLibrarySelectedVideoId(null);
      } finally {
        setLibraryLoading(false);
      }
    },
    [],
  );

  const loadLibraryArtists = useCallback(async (): Promise<boolean> => {
    if (libraryArtistsReady) return true;
    setLibraryArtistsLoading(true);
    setLibraryArtistsError(null);
    try {
      const res = await fetch('/api/library/artists');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLibraryArtistItems([]);
        setLibraryIndexLetters([]);
        setLibraryArtistsReady(false);
        setLibraryArtistsError(
          typeof data?.error === 'string' ? data.error : 'アーティスト一覧の取得に失敗しました。',
        );
        return false;
      }
      setLibraryArtistItems(
        mergeLibraryArtistIndexItems(
          Array.isArray(data?.items)
            ? (data.items as LibraryArtistIndexRow[])
            : [],
        ),
      );
      setLibraryIndexLetters(Array.isArray(data?.letters) ? data.letters : []);
      setLibraryArtistsReady(true);
      return true;
    } catch {
      setLibraryArtistItems([]);
      setLibraryIndexLetters([]);
      setLibraryArtistsReady(false);
      setLibraryArtistsError('アーティスト一覧の取得に失敗しました。');
      return false;
    } finally {
      setLibraryArtistsLoading(false);
    }
  }, [libraryArtistsReady]);

  const selectLibraryArtistIndex = useCallback(
    (letter: string | null) => {
      setLibraryArtistLetter(letter);
      setLibraryArtistIndexActive(true);
      setLibrarySelectedArtistName(null);
      setLibraryRows([]);
      setLibrarySongSource('idle');
      setLibrarySelectedSongId(null);
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError(null);
      void loadLibraryArtists().then((ok) => {
        if (!ok) {
          setLibraryArtistIndexActive(false);
          setLibraryArtistLetter(null);
        }
      });
    },
    [loadLibraryArtists],
  );

  const loadLibrarySongsForArtist = useCallback(async (artist: string) => {
    const name = artist.trim();
    if (!name) return;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const params = new URLSearchParams({ artist: name, sort: 'release' });
      const res = await fetch(`/api/library/songs-by-artist?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLibraryError(
          typeof data?.error === 'string' ? data.error : '曲一覧の取得に失敗しました。',
        );
        setLibraryRows([]);
        setLibrarySelectedSongId(null);
        setLibrarySongVideos([]);
        setLibrarySelectedVideoId(null);
        return;
      }
      const rows: LibrarySongRow[] = Array.isArray(data?.items)
        ? data.items
            .filter((r: any) => r && typeof r.id === 'string')
            .map((r: any) => ({
              id: r.id,
              title:
                (typeof r.display_title === 'string' ? r.display_title : '').trim() ||
                (typeof r.song_title === 'string' ? r.song_title : '').trim() ||
                '（タイトル不明）',
              song_title: typeof r.song_title === 'string' ? r.song_title : null,
              main_artist: typeof r.main_artist === 'string' ? r.main_artist : null,
              style: typeof r.style === 'string' ? r.style : null,
              genres: typeof r.genres === 'string' ? r.genres : null,
              vocal: typeof r.vocal === 'string' ? r.vocal : null,
              play_count: typeof r.play_count === 'number' ? r.play_count : null,
              my_play_count: typeof r.my_play_count === 'number' ? r.my_play_count : null,
              original_release_date:
                typeof r.original_release_date === 'string' ? r.original_release_date : null,
              spotify_popularity:
                typeof r.spotify_popularity === 'number' && Number.isFinite(r.spotify_popularity)
                  ? r.spotify_popularity
                  : null,
              video_id: typeof r.video_id === 'string' ? r.video_id : null,
            }))
        : [];
      setLibraryRows(rows);
      setLibrarySongSource('browse');
      setLibrarySelectedSongId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : null));
    } catch {
      setLibraryError('曲一覧の取得に失敗しました。');
      setLibraryRows([]);
      setLibrarySelectedSongId(null);
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const loadLibrarySongVideos = useCallback(async (songId: string) => {
    setLibraryVideoLoading(true);
    setLibraryVideoError(null);
    try {
      const params = new URLSearchParams({ songId });
      const res = await fetch(`/api/library/song-videos?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLibrarySongVideos([]);
        setLibrarySelectedVideoId(null);
        setLibraryVideoError(
          typeof data?.error === 'string' ? data.error : '動画バージョンの取得に失敗しました。',
        );
        return;
      }
      const rows: LibrarySongVideoRow[] = Array.isArray(data?.items)
        ? data.items
            .filter((r: any) => r && typeof r.video_id === 'string')
            .map((r: any) => ({
              video_id: r.video_id,
              variant: typeof r.variant === 'string' ? r.variant : null,
            }))
        : [];
      setLibrarySongVideos(rows);
      setLibrarySelectedVideoId(rows[0]?.video_id ?? null);
    } catch {
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError('動画バージョンの取得に失敗しました。');
    } finally {
      setLibraryVideoLoading(false);
    }
  }, []);

  const loadLibraryArtistInfo = useCallback(async (artistName: string | null) => {
    const name = (artistName ?? '').trim();
    if (!name) {
      setLibraryArtistInfo(null);
      setLibraryDetailMusic8Artist(null);
      setLibraryArtistInfoError(null);
      setLibraryArtistInfoLoading(false);
      return;
    }
    setLibraryArtistInfoLoading(true);
    setLibraryArtistInfoError(null);
    try {
      const params = new URLSearchParams({ artist: name });
      const res = await fetch(`/api/library/artist-info?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLibraryArtistInfo(null);
        setLibraryDetailMusic8Artist(null);
        setLibraryArtistInfoError(
          typeof data?.error === 'string' ? data.error : 'アーティスト情報の取得に失敗しました。',
        );
        return;
      }
      const a = data?.artist;
      const music8 =
        data?.music8 && typeof data.music8 === 'object'
          ? (data.music8 as Music8ArtistJson)
          : null;

      if (!a || typeof a !== 'object') {
        setLibraryArtistInfo(null);
        setLibraryDetailMusic8Artist(music8);
        return;
      }

      const dbInfo: LibraryArtistInfo = {
        id: typeof a.id === 'string' ? a.id : '',
        name: typeof a.name === 'string' ? a.name : name,
        name_ja: typeof a.name_ja === 'string' ? a.name_ja : null,
        kind: typeof a.kind === 'string' ? a.kind : null,
        origin_country: typeof a.origin_country === 'string' ? a.origin_country : null,
        active_period: typeof a.active_period === 'string' ? a.active_period : null,
        members: typeof a.members === 'string' ? a.members : null,
        image_url: typeof a.image_url === 'string' ? a.image_url : null,
        image_credit: typeof a.image_credit === 'string' ? a.image_credit : null,
        profile_text: typeof a.profile_text === 'string' ? a.profile_text : null,
      };
      setLibraryArtistInfo(dbInfo);
      setLibraryDetailMusic8Artist(
        music8 && isLibraryArtistInfoSparse(dbInfo) ? music8 : null,
      );
    } catch {
      setLibraryArtistInfo(null);
      setLibraryDetailMusic8Artist(null);
      setLibraryArtistInfoError('アーティスト情報の取得に失敗しました。');
    } finally {
      setLibraryArtistInfoLoading(false);
    }
  }, []);

  const libraryLetterKeys = useMemo(() => {
    if (libraryArtistsReady && libraryIndexLetters.length > 0) {
      return buildRoomLibrarySidebarLetters(libraryIndexLetters);
    }
    if (libraryArtistsReady) {
      const set = new Set<string>();
      for (const row of libraryRows) {
        set.add(libraryModalArtistIndexKey(row.main_artist));
      }
      if (set.size > 0) return buildRoomLibrarySidebarLetters(Array.from(set));
    }
    return STATIC_ROOM_LIBRARY_SIDEBAR_LETTERS;
  }, [libraryArtistsReady, libraryIndexLetters, libraryRows]);

  const letterFilteredLibraryRows = useMemo(() => {
    if (librarySongSource === 'browse') return libraryRows;
    if (libraryArtistLetter === null) return libraryRows;
    return libraryRows.filter((r) =>
      libraryArtistIndexLetterMatchesSidebarKey(
        libraryModalArtistIndexKey(r.main_artist),
        libraryArtistLetter,
      ),
    );
  }, [libraryRows, libraryArtistLetter, librarySongSource]);

  /** 検索モード: 表示中の曲行からユニークなアーティスト名＋曲数 */
  const searchArtistRows = useMemo(() => {
    const names = dedupeLibraryArtistDisplayNames(
      letterFilteredLibraryRows.flatMap((row) =>
        expandMainArtistNamesForLibraryFilter(row.main_artist ?? ''),
      ),
    );
    return names.map((main_artist) => ({
      main_artist,
      count: letterFilteredLibraryRows.filter((r) =>
        songMainArtistIncludesArtist(r.main_artist, main_artist),
      ).length,
    }));
  }, [letterFilteredLibraryRows]);

  const searchArtistNameCandidates = useMemo(
    () => searchArtistRows.map((a) => a.main_artist),
    [searchArtistRows],
  );

  /** ブラウズモード: 索引から（字母＋入力欄の部分一致でアーティスト名を絞り込み） */
  useEffect(() => {
    if (!libraryOpen || librarySongSource === 'search') {
      setLibraryJaMainArtistMatches([]);
      return;
    }
    const q = libraryQuery.trim();
    if (q.length < 2) {
      setLibraryJaMainArtistMatches([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/library/match-main-artists?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        const names = Array.isArray(data?.main_artists)
          ? data.main_artists.filter((x: unknown) => typeof x === 'string' && x.trim())
          : [];
        setLibraryJaMainArtistMatches(names);
      } catch {
        if (!cancelled) setLibraryJaMainArtistMatches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryQuery, libraryOpen, librarySongSource]);

  const browseArtistIndexRows = useMemo(() => {
    if (librarySongSource === 'search') return [];
    if (!libraryArtistIndexActive || !libraryArtistsReady || libraryArtistLetter === null) {
      return [];
    }
    let items = libraryArtistItems.filter((a) =>
      libraryArtistIndexLetterMatchesSidebarKey(a.indexLetter, libraryArtistLetter),
    );
    const q = libraryQuery.trim().toLowerCase();
    if (q) {
      const jaMatch = new Set(libraryJaMainArtistMatches.map((n) => n.toLowerCase()));
      items = items.filter((a) => {
        const ma = a.main_artist.toLowerCase();
        return ma.includes(q) || jaMatch.has(ma);
      });
    }
    return mergeLibraryArtistIndexItems(items).sort((a, b) =>
      a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' }),
    );
  }, [
    libraryArtistItems,
    libraryArtistLetter,
    librarySongSource,
    libraryQuery,
    libraryJaMainArtistMatches,
    libraryArtistIndexActive,
    libraryArtistsReady,
  ]);

  const modalArtistRows = useMemo(() => {
    if (!libraryArtistIndexActive || !libraryArtistsReady || libraryArtistLetter === null) {
      return [];
    }
    const items = libraryArtistItems.filter((a) =>
      libraryArtistIndexLetterMatchesSidebarKey(a.indexLetter, libraryArtistLetter),
    );
    return [...items].sort((a, b) =>
      a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' }),
    );
  }, [libraryArtistItems, libraryArtistLetter, libraryArtistIndexActive, libraryArtistsReady]);
  const selectedBrowseArtistRow = useMemo(() => {
    if (!librarySelectedArtistName) return null;
    return (
      browseArtistIndexRows.find((a) => a.main_artist === librarySelectedArtistName) ?? null
    );
  }, [browseArtistIndexRows, librarySelectedArtistName]);

  const selectedArtistSongCount = useMemo(() => {
    if (!librarySelectedArtistName) return null;
    if (librarySongSource === 'search') {
      const sel = librarySelectedArtistName.trim();
      return (
        searchArtistRows.find(
          (a) =>
            a.main_artist.localeCompare(sel, undefined, { sensitivity: 'base' }) === 0 ||
            artistNamesMatchIgnoringLeadingArticle(a.main_artist, sel),
        )?.count ?? null
      );
    }
    return selectedBrowseArtistRow?.count ?? null;
  }, [
    librarySelectedArtistName,
    librarySongSource,
    searchArtistRows,
    selectedBrowseArtistRow,
  ]);

  /** 公開ライブラリ（索引と同じ集計・邦楽寄り除外は API 側） */
  const libraryTotalSongCount = useMemo(
    () => libraryArtistItems.reduce((sum, a) => sum + a.count, 0),
    [libraryArtistItems],
  );

  const filteredLibraryRows = useMemo(() => {
    if (!librarySelectedArtistName) return letterFilteredLibraryRows;
    // ブラウズ API は song_credits 経由の参加曲も返すため main_artist で再絞り込みしない
    if (librarySongSource === 'browse') return letterFilteredLibraryRows;
    return letterFilteredLibraryRows.filter((r) =>
      songMainArtistIncludesArtist(r.main_artist, librarySelectedArtistName),
    );
  }, [letterFilteredLibraryRows, librarySelectedArtistName, librarySongSource]);

  const librarySongRowsSortedForList = useMemo(() => {
    const rows = [...filteredLibraryRows];
    rows.sort((a, b) => {
      if (librarySongListSort === 'title_asc') {
        return librarySongListPrimaryTitle(a).localeCompare(
          librarySongListPrimaryTitle(b),
          'en',
          { sensitivity: 'base' },
        );
      }
      if (librarySongListSort === 'popularity') {
        const pa = a.spotify_popularity ?? -1;
        const pb = b.spotify_popularity ?? -1;
        if (pb !== pa) return pb - pa;
      } else {
        const ta = parseReleaseDateMsForSort(a.original_release_date);
        const tb = parseReleaseDateMsForSort(b.original_release_date);
        const aMissing = ta == null;
        const bMissing = tb == null;
        if (aMissing && bMissing) {
          return librarySongListPrimaryTitle(a).localeCompare(
            librarySongListPrimaryTitle(b),
            'en',
            { sensitivity: 'base' },
          );
        }
        if (aMissing) return 1;
        if (bMissing) return -1;
        const newerFirst = (tb as number) - (ta as number);
        return librarySongListSort === 'release_new' ? newerFirst : -newerFirst;
      }
      return librarySongListPrimaryTitle(a).localeCompare(
        librarySongListPrimaryTitle(b),
        'en',
        { sensitivity: 'base' },
      );
    });
    return rows;
  }, [filteredLibraryRows, librarySongListSort]);

  const selectedLibraryRow =
    libraryOpen && librarySelectedSongId
      ? filteredLibraryRows.find((r) => r.id === librarySelectedSongId) ?? null
      : null;

  const librarySongArtists = useLibrarySongArtists(
    selectedLibraryRow?.id ?? null,
    librarySelectedVideoId,
    selectedLibraryRow?.main_artist ?? null,
  );

  const libraryMobileFocus = useMemo(
    () =>
      resolveLibraryMobileFocus({
        libraryArtistIndexActive,
        librarySelectedArtistName,
        librarySelectedSongId,
        hasSelectedLibraryRow: Boolean(selectedLibraryRow),
        librarySongSource,
        libraryQuery,
      }),
    [
      libraryArtistIndexActive,
      librarySelectedArtistName,
      librarySelectedSongId,
      selectedLibraryRow,
      librarySongSource,
      libraryQuery,
    ],
  );

  const selectedLibraryUrl = librarySelectedVideoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(librarySelectedVideoId)}`
    : '';

  useEffect(() => {
    if (libraryArtistLetter !== null && !libraryLetterKeys.includes(libraryArtistLetter)) {
      setLibraryArtistLetter(null);
    }
  }, [libraryArtistLetter, libraryLetterKeys]);

  useEffect(() => {
    if (!librarySelectedArtistName) return;
    const selected = librarySelectedArtistName.trim();
    if (!selected) return;

    if (librarySongSource === 'search') {
      const match = searchArtistNameCandidates.find(
        (a) =>
          a.toLowerCase() === selected.toLowerCase() ||
          artistNamesMatchIgnoringLeadingArticle(a, selected),
      );
      if (!match) {
        setLibrarySelectedArtistName(null);
      } else if (match !== librarySelectedArtistName) {
        setLibrarySelectedArtistName(match);
      }
      return;
    }

    if (!libraryArtistIndexActive || !libraryArtistsReady || libraryArtistLetter === null) {
      return;
    }
    if (browseArtistIndexRows.length === 0) return;

    const match = browseArtistIndexRows.find(
      (a) => a.main_artist.toLowerCase() === selected.toLowerCase(),
    );
    if (!match) {
      setLibrarySelectedArtistName(null);
    } else if (match.main_artist !== librarySelectedArtistName) {
      setLibrarySelectedArtistName(match.main_artist);
    }
  }, [
    librarySelectedArtistName,
    librarySongSource,
    searchArtistNameCandidates,
    browseArtistIndexRows,
    libraryArtistIndexActive,
    libraryArtistsReady,
    libraryArtistLetter,
  ]);

  useEffect(() => {
    if (!libraryOpen) return;
    setLibrarySelectedSongId((prev) => (prev && filteredLibraryRows.some((r) => r.id === prev) ? prev : null));
  }, [libraryOpen, filteredLibraryRows]);

  const resetLibrarySongListScroll = useCallback(() => {
    librarySongListScrollTopRef.current = 0;
    if (librarySongListScrollRef.current) librarySongListScrollRef.current.scrollTop = 0;
  }, []);

  const resetLibraryExpanded = useCallback(() => {
    setLibraryLetterModalOpen(false);
    setLibraryCopyState('idle');
    setLibraryArtistIndexActive(false);
    setLibraryArtistLetter(null);
    setLibrarySelectedArtistName(null);
    setLibrarySelectedSongId(null);
    setLibrarySongVideos([]);
    setLibrarySelectedVideoId(null);
    setLibraryVideoError(null);
    setLibraryRows([]);
    setLibrarySongSource('idle');
    setLibrarySongListSort('release_new');
    setLibraryJaMainArtistMatches([]);
    setLibraryDetailMusic8Artist(null);
    resetLibrarySongListScroll();
  }, [resetLibrarySongListScroll]);

  const clearLibrarySongSelection = useCallback(() => {
    setLibrarySelectedSongId(null);
    setLibrarySongVideos([]);
    setLibrarySelectedVideoId(null);
    setLibraryVideoError(null);
    setLibraryCopyState('idle');
  }, []);

  const libraryHasExpandedContent =
    libraryArtistIndexActive ||
    libraryArtistLetter !== null ||
    librarySelectedArtistName !== null ||
    librarySelectedSongId !== null ||
    libraryRows.length > 0 ||
    librarySongSource !== 'idle' ||
    libraryLetterModalOpen;

  const libraryEntryIdle = !libraryHasExpandedContent;

  const openLibraryModal = useCallback(() => {
    if (roomInteractionLocked) return;
    setLibraryOpen(true);
    void loadLibraryArtists();
  }, [roomInteractionLocked, loadLibraryArtists]);

  const closeLibraryModal = useCallback(() => {
    if (librarySongListScrollRef.current) {
      librarySongListScrollTopRef.current = librarySongListScrollRef.current.scrollTop;
    }
    setLibraryOpen(false);
  }, []);

  const submitLibrarySongSelection = useCallback(() => {
    if (!onVideoUrl || !selectedLibraryUrl) return;
    onVideoUrl(selectedLibraryUrl);
    setValue('');
    if (librarySongListScrollRef.current) {
      librarySongListScrollTopRef.current = librarySongListScrollRef.current.scrollTop;
    }
    clearLibrarySongSelection();
    setLibraryOpen(false);
  }, [onVideoUrl, selectedLibraryUrl, clearLibrarySongSelection]);

  useEffect(() => {
    if (!libraryOpen || libraryArtistsReady || libraryArtistsLoading) return;
    void loadLibraryArtists();
  }, [libraryOpen, libraryArtistsReady, libraryArtistsLoading, loadLibraryArtists]);

  const switchLibraryToArtist = useCallback(
    (artistName: string) => {
      const name = resolveLibraryMainArtistName(artistName, libraryArtistItems);
      if (!name) return;
      setLibraryQuery('');
      setLibraryJaMainArtistMatches([]);
      setLibraryCopyState('idle');
      setLibrarySelectedArtistName(name);
      setLibrarySelectedSongId(null);
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError(null);
      setLibraryDetailMusic8Artist(null);
      setLibrarySongSource('browse');
      setLibraryArtistIndexActive(true);
      setLibraryArtistLetter(libraryModalArtistIndexKey(name));
      resetLibrarySongListScroll();
      void loadLibrarySongsForArtist(name);
      void loadLibraryArtistInfo(name);
    },
    [libraryArtistItems, loadLibrarySongsForArtist, loadLibraryArtistInfo, resetLibrarySongListScroll],
  );

  const openLibraryModalForArtist = useCallback(
    async (mainArtist: string, options?: { music8Artist?: Music8ArtistJson | null }) => {
      if (roomInteractionLocked) return;
      const name = mainArtist.trim();
      if (!name) return;
      setLibraryLetterModalOpen(false);
      setLibraryCopyState('idle');
      setLibraryArtistIndexActive(true);
      setLibraryArtistLetter(libraryModalArtistIndexKey(name));
      setLibrarySelectedArtistName(name);
      setLibrarySelectedSongId(null);
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError(null);
      setLibraryQuery('');
      setLibraryJaMainArtistMatches([]);
      setLibraryDetailMusic8Artist(options?.music8Artist ?? null);
      setLibrarySongSource('browse');
      setLibraryOpen(true);
      resetLibrarySongListScroll();
      void loadLibraryArtistInfo(name);
      await loadLibraryArtists();
      if (roomInteractionLocked) return;
      void loadLibrarySongsForArtist(name);
    },
    [roomInteractionLocked, loadLibraryArtists, loadLibrarySongsForArtist, loadLibraryArtistInfo, resetLibrarySongListScroll],
  );

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        setValue((v) => v + text);
        inputRef.current?.focus();
      },
      searchYoutubeWithQuery(query: string) {
        if (!isYoutubeKeywordSearchEnabled()) return;
        const q = query.trim().slice(0, MAX_MESSAGE_LENGTH);
        if (!q) return;
        setValue(q);
        requestAnimationFrame(() => inputRef.current?.focus());
        void runYoutubeKeywordSearch(q);
      },
      openLibraryForArtist(mainArtist: string, options?: { music8Artist?: Music8ArtistJson | null }) {
        void openLibraryModalForArtist(mainArtist, options);
      },
      openLibrary() {
        openLibraryModal();
      },
    }),
    [runYoutubeKeywordSearch, openLibraryModalForArtist, openLibraryModal],
  );

  const handleLibrarySearch = useCallback(() => {
    setLibrarySelectedArtistName(null);
    setLibrarySelectedSongId(null);
    setLibrarySongVideos([]);
    setLibrarySelectedVideoId(null);
    setLibraryVideoError(null);
    setLibrarySongSource('search');
    resetLibrarySongListScroll();
    void loadLibraryRows(libraryQuery);
  }, [libraryQuery, loadLibraryRows, resetLibrarySongListScroll]);

  const copyLibraryUrl = useCallback(async () => {
    if (!selectedLibraryUrl) return;
    try {
      await navigator.clipboard.writeText(selectedLibraryUrl);
      setLibraryCopyState('ok');
    } catch {
      setLibraryCopyState('fail');
    }
  }, [selectedLibraryUrl]);

  const addLibrarySelectionToMyList = useCallback(async () => {
    if (isGuest || !onSystemMessage || !librarySelectedVideoId || !selectedLibraryUrl) return;
    if (libraryMyListAddBusy) return;
    setLibraryMyListAddBusy(true);
    try {
      const title =
        (selectedLibraryRow?.song_title ?? selectedLibraryRow?.title ?? '').trim() || null;
      const artist = selectedLibraryRow?.main_artist?.trim() || null;
      const result = await postMyListItemClient({
        videoId: librarySelectedVideoId,
        url: selectedLibraryUrl,
        title,
        artist,
        source: 'manual_url',
      });
      if (!result.ok) {
        onSystemMessage(
          result.status === 401
            ? 'マイリストに追加するにはログインしてください。'
            : result.error,
        );
        return;
      }
      onSystemMessage(
        result.duplicate
          ? 'すでにマイリストにあります（同一動画は1件まで）。'
          : 'マイリストに追加しました。マイページの「マイリスト」タブで確認できます。',
      );
    } finally {
      setLibraryMyListAddBusy(false);
    }
  }, [
    isGuest,
    onSystemMessage,
    librarySelectedVideoId,
    selectedLibraryUrl,
    selectedLibraryRow,
    libraryMyListAddBusy,
  ]);

  const libraryDetailActionGridClass =
    !isGuest && onSystemMessage
      ? 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3'
      : 'mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2';

  useEffect(() => {
    if (!librarySelectedSongId) {
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError(null);
      return;
    }
    if (!libraryOpen) return;
    void loadLibrarySongVideos(librarySelectedSongId);
  }, [libraryOpen, librarySelectedSongId, loadLibrarySongVideos]);

  useEffect(() => {
    if (!libraryOpen) {
      if (librarySongListScrollRef.current) {
        librarySongListScrollTopRef.current = librarySongListScrollRef.current.scrollTop;
      }
      return;
    }
    const saved = librarySongListScrollTopRef.current;
    if (saved <= 0) return;
    requestAnimationFrame(() => {
      if (librarySongListScrollRef.current) {
        librarySongListScrollRef.current.scrollTop = saved;
      }
    });
  }, [libraryOpen]);
  useEffect(() => {
    resetLibrarySongListScroll();
  }, [librarySelectedArtistName, libraryArtistLetter, librarySongSource, resetLibrarySongListScroll]);

  const selectedArtistForInfo = librarySelectedArtistName ?? selectedLibraryRow?.main_artist ?? null;

  const libraryTabCActive =
    (libraryArtistIndexActive &&
      !libraryArtistsLoading &&
      browseArtistIndexRows.length > 0) ||
    (!libraryLoading &&
      librarySongSource === 'search' &&
      searchArtistNameCandidates.length > 0);
  const libraryTabDActive = Boolean(selectedArtistForInfo && !libraryArtistInfoLoading);
  const libraryTabEActive = !libraryLoading && filteredLibraryRows.length > 0;
  const libraryTabFActive = Boolean(selectedLibraryRow);

  useEffect(() => {
    if (!selectedArtistForInfo) {
      setLibraryArtistInfo(null);
      setLibraryArtistInfoError(null);
      setLibraryArtistInfoLoading(false);
      return;
    }
    if (!libraryOpen) return;
    void loadLibraryArtistInfo(selectedArtistForInfo);
  }, [libraryOpen, selectedArtistForInfo, loadLibraryArtistInfo]);

  const stopPreview = () => {
    if (previewWatchedTimerRef.current) {
      clearTimeout(previewWatchedTimerRef.current);
      previewWatchedTimerRef.current = null;
    }
    setPreviewOpen(false);
    setPreviewVideoId(null);
    onPreviewStop?.();
  };

  const startPreview = (videoId: string) => {
    // 既に同じ動画をプレビュー中なら何もしない
    if (previewOpen && previewVideoId === videoId) return;

    if (previewWatchedTimerRef.current) {
      clearTimeout(previewWatchedTimerRef.current);
      previewWatchedTimerRef.current = null;
    }

    setPreviewVideoId(videoId);
    setPreviewOpen(true);
    onPreviewStart?.(videoId);

    // 完全な「視聴完了」判定はできないので、数秒再生したら「視聴済み」扱いにする
    previewWatchedTimerRef.current = setTimeout(() => {
      setWatchedVideoIds((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
      previewWatchedTimerRef.current = null;
    }, 3000);
  };

  const previewResultRow =
    searchResultsOpen && previewOpen && previewVideoId
      ? searchResults.find((r) => r.videoId === previewVideoId) ?? null
      : null;

  useEffect(() => {
    if (!themePlaylistConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setThemePlaylistConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [themePlaylistConfirmOpen]);

  useEffect(() => {
    if (!themePlaylistRoomSubmit) setThemePlaylistConfirmOpen(false);
  }, [themePlaylistRoomSubmit]);

  useEffect(() => {
    if (libraryCopyState === 'idle') return;
    const t = setTimeout(() => setLibraryCopyState('idle'), 1800);
    return () => clearTimeout(t);
  }, [libraryCopyState]);

  useEffect(() => {
    if (libraryOpen && librarySelectedVideoId && !libraryPreviewActiveRef.current) {
      libraryPreviewActiveRef.current = true;
      onPreviewStart?.(librarySelectedVideoId);
      return;
    }
    if ((!libraryOpen || !librarySelectedVideoId) && libraryPreviewActiveRef.current) {
      libraryPreviewActiveRef.current = false;
      onPreviewStop?.();
    }
  }, [libraryOpen, librarySelectedVideoId, onPreviewStart, onPreviewStop]);

  useEffect(() => {
    if (!libraryOpen && libraryPreviewActiveRef.current) {
      libraryPreviewActiveRef.current = false;
      onPreviewStop?.();
    }
  }, [libraryOpen, onPreviewStop]);

  return (
    <>
      {searchResultsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="検索結果"
          onClick={() => setSearchResultsOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded border border-gray-700 bg-gray-900 p-4 text-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">検索結果（上位5件）</div>
              <button
                type="button"
                className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                onClick={() => setSearchResultsOpen(false)}
              >
                閉じる
              </button>
            </div>
            <div className="mc-scrollbar-stable max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <li key={r.videoId}>
                    <div className="rounded border border-gray-700 bg-gray-800/60 px-3 py-2">
                      <div className="flex items-start gap-3">
                        {r.thumbnailUrl && (
                          <div className="w-20 flex-shrink-0">
                            <div className="h-12 w-20 overflow-hidden rounded bg-black/40">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={r.thumbnailUrl}
                                alt={r.title || r.artistTitle}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="mt-1 whitespace-nowrap text-[11px] leading-none text-gray-400">
                              {r.publishedAt ? r.publishedAt.slice(0, 10) : ''}
                            </div>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-100 line-clamp-2 break-words">
                            {r.title}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400 line-clamp-2 break-words">
                            {r.artistTitle}
                            {r.channelTitle ? ` / ${r.channelTitle}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          className="min-h-[2.25rem] rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 hover:bg-gray-700"
                          onClick={() => {
                            startPreview(r.videoId);
                          }}
                        >
                          プレビュー
                        </button>
                        {onAddCandidate ? (
                          <button
                            type="button"
                            disabled={
                              !watchedVideoIds.includes(r.videoId) || addedCandidateVideoIds.includes(r.videoId)
                            }
                            className="min-h-[2.25rem] rounded border border-emerald-600 bg-emerald-900/40 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              if (!watchedVideoIds.includes(r.videoId)) return;
                              if (addedCandidateVideoIds.includes(r.videoId)) return;
                              playCandidateAddedSe();
                              onAddCandidate(r);
                              setAddedCandidateVideoIds((prev) =>
                                prev.includes(r.videoId) ? prev : [...prev, r.videoId],
                              );
                            }}
                          >
                            {addedCandidateVideoIds.includes(r.videoId)
                              ? '追加済み'
                              : watchedVideoIds.includes(r.videoId)
                                ? '候補'
                                : '候補（視聴後）'}
                          </button>
                        ) : (
                          <div aria-hidden="true" />
                        )}
                        {onVideoUrl ? (
                          <button
                            type="button"
                            className="min-h-[2.25rem] rounded border border-blue-500/70 bg-blue-900/40 px-2 py-1 text-[11px] text-blue-100 hover:bg-blue-900/70"
                            onClick={() => {
                              onVideoUrl(
                                `https://www.youtube.com/watch?v=${encodeURIComponent(r.videoId)}`,
                              );
                              setSearchResultsOpen(false);
                              setValue('');
                            }}
                          >
                            今すぐ貼る
                          </button>
                        ) : (
                          <div aria-hidden="true" />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {youtubeSearchQueryForModal.trim() !== '' && (
              <div className="mt-3 border-t border-gray-700 pt-3">
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                    youtubeSearchQueryForModal,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[2.5rem] w-full items-center justify-center rounded border border-gray-600 bg-gray-800/80 px-3 py-2 text-center text-xs font-medium text-blue-200 underline-offset-2 hover:border-gray-500 hover:bg-gray-800 hover:text-blue-100"
                >
                  全ての検索結果（別タブで表示）
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {previewOpen && previewVideoId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="プレビュー"
          onClick={() => stopPreview()}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded border border-gray-700 bg-gray-900 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-100">プレビュー</div>
              <button
                type="button"
                className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700"
                onClick={() => stopPreview()}
              >
                閉じる
              </button>
            </div>
            <div className="aspect-video overflow-hidden rounded bg-black">
              <iframe
                title="YouTube preview"
                src={`https://www.youtube.com/embed/${encodeURIComponent(
                  previewVideoId,
                )}?autoplay=1&controls=1&modestbranding=1`}
                className="h-full w-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
            {searchResultsOpen && (
              <>
                {previewResultRow && (
                  <div className="mt-2 rounded border border-gray-700 bg-gray-800/60 px-3 py-2">
                    <div className="flex items-start gap-3">
                      {previewResultRow.thumbnailUrl && (
                        <div className="w-20 flex-shrink-0">
                          <div className="h-12 w-20 overflow-hidden rounded bg-black/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewResultRow.thumbnailUrl}
                              alt={previewResultRow.title || previewResultRow.artistTitle}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="mt-1 whitespace-nowrap text-[11px] leading-none text-gray-400">
                            {previewResultRow.publishedAt
                              ? previewResultRow.publishedAt.slice(0, 10)
                              : ''}
                          </div>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-100 line-clamp-2 break-words">
                          {previewResultRow.title}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400 line-clamp-2 break-words">
                          {previewResultRow.artistTitle}
                          {previewResultRow.channelTitle
                            ? ` / ${previewResultRow.channelTitle}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="min-h-[2.75rem] rounded border border-gray-600 bg-gray-800 px-1 py-1.5 text-center text-[11px] font-medium leading-tight text-gray-200 hover:bg-gray-700 sm:px-2"
                    onClick={() => stopPreview()}
                  >
                    <span className="flex flex-col items-center gap-0">
                      <span>キャンセル</span>
                      <span>（検索結果に戻る）</span>
                    </span>
                  </button>
                  {onAddCandidate ? (
                    <button
                      type="button"
                      disabled={
                        !watchedVideoIds.includes(previewVideoId) ||
                        addedCandidateVideoIds.includes(previewVideoId)
                      }
                      className="min-h-[2.25rem] rounded border border-emerald-600 bg-emerald-900/40 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (!watchedVideoIds.includes(previewVideoId)) return;
                        if (addedCandidateVideoIds.includes(previewVideoId)) return;
                        const row = previewResultRow ?? searchResults.find((r) => r.videoId === previewVideoId);
                        if (!row) return;
                        playCandidateAddedSe();
                        onAddCandidate(row);
                        setAddedCandidateVideoIds((prev) =>
                          prev.includes(previewVideoId) ? prev : [...prev, previewVideoId],
                        );
                      }}
                    >
                      {addedCandidateVideoIds.includes(previewVideoId)
                        ? '追加済み'
                        : watchedVideoIds.includes(previewVideoId)
                          ? '候補'
                          : '候補（視聴後）'}
                    </button>
                  ) : (
                    <div aria-hidden="true" />
                  )}
                  {onVideoUrl ? (
                    <button
                      type="button"
                      className="min-h-[2.25rem] rounded border border-blue-500/70 bg-blue-900/40 px-2 py-1 text-[11px] text-blue-100 hover:bg-blue-900/70"
                      onClick={() => {
                        onVideoUrl(
                          `https://www.youtube.com/watch?v=${encodeURIComponent(previewVideoId)}`,
                        );
                        setSearchResultsOpen(false);
                        setValue('');
                        stopPreview();
                      }}
                    >
                      今すぐ貼る
                    </button>
                  ) : (
                    <div aria-hidden="true" />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SongSelectionHowtoModal open={songHowtoOpen} onClose={() => setSongHowtoOpen(false)} />

      {usageGuideOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-input-usage-guide-title"
          onClick={() => setUsageGuideOpen(false)}
        >
          <div
            className="max-h-[min(80vh,28rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="chat-input-usage-guide-title" className="mb-3 text-sm font-semibold text-white">
              発言方法
            </h2>
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-gray-300">
              <li>
                <span className="font-medium text-gray-200">送信</span>
                ：<span className="text-gray-200">YouTube のURL</span>
                を入れて押すと、部屋のプレイヤーにその動画が表示されます。URL
                <span className="text-gray-200">以外</span>（感想・会話など）はチャットに表示されます。
              </li>
              {themePlaylistRoomSubmit ? (
                <li>
                  <span className="font-medium text-gray-200">お題曲送信（β）</span>
                  ：マイページでお題ミッションを進行中のとき、URL を入れたうえでこちらを押すと確認モーダルが開き、確定後に送信されます。通常の
                  AI 曲解説のあとにお題に沿った講評が続きます（通常の「送信」ではお題には紐づきません）。
                </li>
              ) : null}
              <li>
                自分の順番が回ってきて選曲をパスする場合は、発言欄に
                <span className="text-gray-200"> パス </span>
                と入力してください。
              </li>
              <li>
                <span className="font-medium text-gray-200">AIに質問</span>
                ：文頭に
                <span className="text-gray-200">@</span>
                を付けるとAIが返答します（例:
                <span className="text-gray-200">@ おすすめの洋楽を1つ教えて</span>）。
                {isAiQuestionGuardDisabledClient() ? (
                  <>
                    現在の設定では自動の音楽関連チェックやイエローカードによる制限は行っていません（詳細は「AI
                    について」）。
                  </>
                ) : (
                  <>
                    質問は音楽関連にしてください。音楽以外と判断された場合は、チャット内に控えめな案内が出ることがあります（イエローカードや退場は行いません。詳細はご利用上の注意「AI
                    について」）。
                  </>
                )}
                <button
                  type="button"
                  className="ml-2 inline-flex items-center text-xs text-amber-200 underline decoration-dotted underline-offset-2 hover:text-amber-100"
                  onClick={() => {
                    setUsageGuideOpen(false);
                    setAiQuestionExamplesOpen(true);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={aiQuestionExamplesOpen}
                  aria-label="AIへの質問例を表示"
                >
                  AI質問例を見る
                </button>
              </li>
              {isYoutubeKeywordSearchEnabled() ? (
                <li>
                  <span className="font-medium text-gray-200">検索</span>
                  ：アーティスト名・曲名などの
                  <span className="text-gray-200">キーワード</span>
                  を入れて押すと、候補動画の一覧が開きます（別タブではなくこの画面の上に表示されます）。
                </li>
              ) : null}
            </ul>
            {onClearLocalAiQuestionGuard && (
              <div className="mt-4 border-t border-gray-700 pt-3">
                <button
                  type="button"
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-xs text-gray-200 hover:bg-gray-700"
                  onClick={() => {
                    onClearLocalAiQuestionGuard();
                    setUsageGuideOpen(false);
                  }}
                >
                  この端末の AI 質問関連のローカル記録・入室制限をリセット
                </button>
                <p className="mt-1.5 text-[10px] leading-snug text-gray-500">
                  このブラウザに保存された旧ガードの警告カウントや退場記録を消します。
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setUsageGuideOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
      {aiQuestionExamplesOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-input-ai-examples-title"
          onClick={() => setAiQuestionExamplesOpen(false)}
        >
          <div
            className="max-h-[min(80vh,28rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-600 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="chat-input-ai-examples-title" className="mb-3 text-sm font-semibold text-white">
              AIへの質問例
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-gray-300">
              文頭に <span className="text-gray-200">@</span> を付けると AI に質問できます。下の例をそのまま入力して使えます。
            </p>
            <ul className="space-y-2">
              {aiQuestionExamples.map((example) => (
                <li key={example.question} className="rounded border border-gray-700 bg-gray-800/60 p-2">
                  <details className="group">
                    <summary className="cursor-pointer list-none break-words text-sm leading-relaxed text-gray-100">
                      <span className="inline-flex items-center gap-2">
                        <span>{example.question}</span>
                        <span className="text-xs text-gray-400 group-open:hidden">回答を表示</span>
                        <span className="hidden text-xs text-gray-400 group-open:inline">回答を閉じる</span>
                      </span>
                    </summary>
                    <p className="mt-2 whitespace-pre-line rounded border border-gray-700 bg-gray-900/60 p-2 text-sm leading-relaxed text-gray-300">
                      {example.answer}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setAiQuestionExamplesOpen(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {themePlaylistConfirmOpen && themePlaylistRoomSubmit && onVideoUrl ? (
        <div
          className="fixed inset-0 z-[88] flex items-center justify-center bg-black/65 p-4"
          role="presentation"
          onClick={() => setThemePlaylistConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-playlist-send-confirm-title"
            className="w-full max-w-md rounded-lg border border-amber-800/50 bg-gray-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="theme-playlist-send-confirm-title" className="text-sm font-semibold text-amber-100">
              お題曲の送信
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-gray-300">
              お題「<span className="font-medium text-gray-100">{themePlaylistRoomSubmit.themeLabel}</span>
              」として、次の URL を<strong className="text-gray-200">お題曲送信</strong>します。通常の「送信」とは別扱いで、曲解説のあとにお題講評が付きます。
            </p>
            <p className="mt-2 break-all rounded border border-gray-700 bg-gray-950/80 px-2 py-1.5 font-mono text-[11px] text-gray-400">
              {value.trim() || '（URL なし）'}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700"
                onClick={() => setThemePlaylistConfirmOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => confirmThemePlaylistVideoSubmit()}
                className="rounded border border-amber-600/80 bg-amber-800/80 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-700/90"
              >
                送信する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {libraryOpen && (
        <div
          className="fixed inset-0 z-[96] flex items-center justify-center bg-black/75 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="ライブラリ"
        >
          <div
            className={`relative flex w-full max-w-[100rem] flex-col overflow-hidden rounded-lg border border-lime-600/60 bg-gray-950 ${
              isMobileLandscape ? 'h-[92vh]' : 'h-[88vh]'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`border-b border-lime-900/60 ${
                isMobileLandscape
                  ? 'flex items-center gap-2 px-2 py-1.5'
                  : 'flex flex-col gap-2 px-3 py-2.5 sm:px-4 sm:py-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3'
              }`}
            >
              <div
                className={`flex min-w-0 flex-1 gap-2 overflow-hidden ${
                  isMobileLandscape ? 'items-center' : 'items-baseline'
                }`}
              >
                <h2 className={`shrink-0 font-semibold text-white ${isMobileLandscape ? 'text-xs' : 'text-sm'}`}>
                  ライブラリから選曲
                </h2>
                {!isMobileLandscape && libraryArtistsReady && !libraryArtistsError && libraryArtistItems.length > 0 ? (
                  <p className="min-w-0 truncate text-[11px] text-gray-400">
                    登録曲数{' '}
                    <span className="font-semibold tabular-nums text-lime-200/90">
                      {libraryTotalSongCount.toLocaleString()}
                    </span>{' '}
                    曲
                    <span className="text-gray-600">（{libraryArtistItems.length} アーティスト）</span>
                  </p>
                ) : null}
                {libraryEntryIdle && !isMobileLandscape ? (
                  <p className="hidden min-w-0 flex-1 truncate text-[11px] text-gray-400 sm:block lg:hidden">
                    <span className="text-gray-500">はじめに：</span>
                    <span className="inline-flex items-center gap-1">
                      <LibrarySectionBadge section="search" small />
                      検索
                    </span>
                    <span className="mx-1 text-gray-600">または</span>
                    <span className="inline-flex items-center gap-1">
                      <LibrarySectionTabImage section="index" small />
                      A–Z
                    </span>
                  </p>
                ) : null}
                {isMobileLandscape ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <LibrarySectionBadge section="search" small title="A：検索" />
                    <input
                      type="search"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLibrarySearch();
                        }
                      }}
                      placeholder="アーティスト名・曲名で検索"
                      className={`h-8 min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-2 text-xs text-gray-100 outline-none focus:border-lime-500 ${
                        libraryEntryIdle ? 'ring-1 ring-amber-500/50' : ''
                      }`}
                    />
                  </div>
                ) : null}
              </div>
              <div
                className={`flex min-w-0 items-center gap-2 ${
                  isMobileLandscape ? 'shrink-0 gap-1' : 'lg:ml-auto lg:shrink-0'
                }`}
              >
                {!isMobileLandscape ? (
                  <div className="flex items-center gap-1.5 sm:w-[16rem] sm:flex-none md:w-[18rem]">
                    <LibrarySectionBadge section="search" title="A：検索" />
                    <input
                      type="search"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLibrarySearch();
                        }
                      }}
                      placeholder="アーティスト名・曲名で検索"
                      className={`h-9 min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-3 text-sm text-gray-100 outline-none focus:border-lime-500 ${
                        libraryEntryIdle ? 'ring-1 ring-amber-500/50' : ''
                      }`}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleLibrarySearch}
                  disabled={libraryLoading}
                  className={`inline-flex shrink-0 items-center justify-center rounded border border-lime-500/70 bg-lime-900/30 text-xs text-lime-100 hover:bg-lime-900/60 disabled:opacity-50 ${
                    isMobileLandscape ? 'h-8 px-2.5' : 'h-9 px-3'
                  }`}
                >
                  検索
                </button>
                <button
                  type="button"
                  className={`inline-flex shrink-0 items-center justify-center rounded border border-lime-700/60 bg-gray-800 text-xs text-lime-100 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 ${
                    isMobileLandscape ? 'h-8 px-2.5' : 'h-9 px-3'
                  }`}
                  onClick={resetLibraryExpanded}
                  disabled={!libraryHasExpandedContent}
                  aria-label="ライブラリの展開状態をリセット"
                >
                  リセット
                </button>
                <button
                  type="button"
                  className={`inline-flex shrink-0 items-center justify-center rounded border border-lime-700/60 bg-gray-800 text-xs text-lime-100 hover:bg-gray-700 ${
                    isMobileLandscape ? 'h-8 px-2.5' : 'h-9 px-3'
                  }`}
                  onClick={closeLibraryModal}
                >
                  閉じる
                </button>
              </div>
              {libraryEntryIdle && !isMobileLandscape ? (
                <p className="w-full text-[11px] leading-snug text-gray-400 lg:order-last lg:basis-full">
                  <span className="text-gray-500">はじめに：</span>
                  <span className="inline-flex items-center gap-1">
                    <LibrarySectionBadge section="search" small />
                    検索
                  </span>
                  <span className="mx-1.5 text-gray-600">または</span>
                  <span className="inline-flex items-center gap-1">
                    <LibrarySectionTabImage section="index" small />
                    左の A–Z 索引
                  </span>
                </p>
              ) : null}
            </div>
            <div
              className={`grid min-h-0 flex-1 grid-cols-1 gap-3 px-2 pb-2 pt-1 max-lg:gap-2 max-lg:bg-gray-950/80 lg:gap-0 lg:p-0 lg:bg-transparent lg:grid-cols-12 lg:pb-0 ${
                isMobileLandscape
                  ? selectedLibraryRow
                    ? 'max-lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.38fr)_minmax(0,0.20fr)]'
                    : 'max-lg:grid-cols-[minmax(0,0.40fr)_minmax(0,0.60fr)] max-lg:pt-0.5'
                  : 'max-lg:flex max-lg:flex-col'
              }`}
            >
              <div
                className={`flex min-h-0 flex-col border-b border-lime-900/60 max-lg:border-0 lg:col-span-3 lg:h-full lg:min-h-0 lg:flex-row lg:border-b-0 lg:border-r lg:border-r-lime-900/60 ${
                  !isMobileLandscape && !isLg && libraryMobileFocus === 'split'
                    ? 'max-lg:hidden'
                    : isMobileLandscape && selectedLibraryRow
                      ? 'max-lg:hidden'
                      : ''
                }`}
              >
              <aside
                className={`hidden max-h-[40vh] shrink-0 flex-col border-b border-lime-900/60 lg:flex lg:max-h-none lg:border-b-0 lg:border-r lg:border-r-lime-900/60 ${
                  libraryEntryIdle ? 'bg-cyan-950/15 ring-2 ring-inset ring-cyan-500/30' : ''
                }`}
                style={{ width: LIBRARY_TAB_B_DISPLAY_WIDTH_PX }}
                aria-label="アーティスト頭文字"
              >
                <div className="hidden shrink-0 border-b border-lime-900/50 lg:flex lg:items-center lg:justify-center lg:py-2">
                  <LibrarySectionTabImage section="index" />
                </div>
                <div className="mc-scrollbar-stable flex min-h-0 flex-1 flex-row flex-wrap gap-0.5 px-1 py-1.5 lg:flex-col lg:flex-nowrap lg:gap-0.5 lg:overflow-y-auto">
                  {libraryLetterKeys.map((L) => (
                    <button
                      key={L}
                      type="button"
                      onClick={() => void selectLibraryArtistIndex(L)}
                      aria-pressed={libraryArtistIndexActive && libraryArtistLetter === L}
                      aria-label={
                        L === LIBRARY_MODAL_INDEX_HASH
                          ? '0から9の数字または記号で始まるアーティスト'
                          : undefined
                      }
                      className={`shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums lg:w-full ${
                        libraryArtistIndexActive && libraryArtistLetter === L
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      {L === LIBRARY_MODAL_INDEX_HASH ? (
                        <span className="flex flex-col items-center gap-0.5 leading-none">
                          <span className="text-[11px]">0–9</span>
                          <span className="text-[10px] font-normal opacity-90"># 記号</span>
                        </span>
                      ) : (
                        L
                      )}
                    </button>
                  ))}
                </div>
              </aside>
              {/* アーティスト一覧（索引と密着・選択後も表示） */}
              <section
                className={`flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-b border-lime-900/60 lg:w-[11rem] lg:shrink-0 lg:border-b-0 xl:w-[12.5rem] ${LIBRARY_MOBILE_PANEL.artistList.section} ${libraryMobileArtistListSectionExtra(libraryMobileFocus, isMobileLandscape)}`}
              >
                <div className="shrink-0 border-b border-lime-900/60 px-2 py-2 max-lg:border-lime-700/35 max-lg:bg-lime-950/40 lg:hidden">
                  <div className="flex items-center gap-2">
                    <LibrarySectionTabImage section="index" />
                    <button
                      type="button"
                      onClick={() => setLibraryLetterModalOpen(true)}
                      className={`h-9 min-w-0 flex-1 rounded border border-lime-500/70 bg-lime-900/30 px-2 text-xs text-lime-100 hover:bg-lime-900/60 ${
                        libraryEntryIdle ? 'ring-1 ring-cyan-500/45' : ''
                      }`}
                      aria-haspopup="dialog"
                      aria-expanded={libraryLetterModalOpen}
                      aria-label="アルファベット索引を開く"
                    >
                      アルファベット索引
                    </button>
                  </div>
                </div>
                <div className={`shrink-0 lg:hidden ${LIBRARY_MOBILE_PANEL.artistList.header}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <LibrarySectionTabImage section="artistList" active={libraryTabCActive} />
                    {libraryArtistIndexActive && libraryArtistLetter ? (
                      <p className={`min-w-0 tabular-nums ${LIBRARY_MOBILE_PANEL.artistList.title}`}>
                        （{libraryArtistLetter}）
                      </p>
                    ) : null}
                  </div>
                  {librarySelectedArtistName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLibrarySelectedArtistName(null);
                        setLibraryRows([]);
                        setLibrarySongSource('idle');
                        setLibrarySelectedSongId(null);
                        setLibrarySongVideos([]);
                        setLibrarySelectedVideoId(null);
                      }}
                      className="shrink-0 rounded border border-lime-600/50 bg-lime-950/80 px-2 py-0.5 text-[10px] text-lime-100 hover:bg-lime-900/80"
                    >
                      解除
                    </button>
                  ) : null}
                </div>
                <div className="hidden shrink-0 items-center justify-between gap-1 border-b border-lime-900/50 px-2.5 py-2 lg:flex">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <LibrarySectionTabImage section="artistList" active={libraryTabCActive} />
                    {libraryArtistIndexActive && libraryArtistLetter ? (
                      <p className="min-w-0 text-[10px] leading-snug tabular-nums text-gray-500">
                        （{libraryArtistLetter}）
                      </p>
                    ) : null}
                  </div>
                  {librarySelectedArtistName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setLibrarySelectedArtistName(null);
                        setLibraryRows([]);
                        setLibrarySongSource('idle');
                        setLibrarySelectedSongId(null);
                        setLibrarySongVideos([]);
                        setLibrarySelectedVideoId(null);
                      }}
                      className="shrink-0 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-200 hover:bg-gray-800"
                    >
                      解除
                    </button>
                  ) : null}
                </div>
                <div
                  className={`mc-scrollbar-stable flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto lg:overflow-x-hidden ${LIBRARY_MOBILE_PANEL.artistList.body}`}
                >
                  {!libraryArtistsLoading && libraryArtistsError ? (
                    <p className="border-b border-lime-900/50 px-3 py-2 text-[11px] text-amber-300">
                      {libraryArtistsError}
                    </p>
                  ) : null}
                  {librarySongSource !== 'search' ? (
                    <div className="flex min-h-0 flex-1 flex-col border-b border-lime-900/50 px-2 py-2 max-lg:border-0 max-lg:px-3 max-lg:py-2 lg:px-2.5">
                      {!libraryArtistIndexActive && !libraryArtistsLoading ? (
                        libraryEntryIdle ? (
                          <>
                            <LibraryEntryGuide className="mx-0.5 my-1 max-lg:my-2 lg:hidden" />
                            <p className="hidden px-0.5 py-1 text-[10px] leading-snug text-gray-500 lg:block">
                              A 検索 または左の A–Z B から始めてください。
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="px-0.5 py-1 text-[10px] leading-snug text-lime-200/55 lg:hidden">
                              アルファベット索引から字母を選ぶと一覧が表示されます。
                            </p>
                            <p className="hidden px-0.5 py-1 text-[10px] leading-snug text-gray-500 lg:block">
                              左の A–Z から字母を選ぶと一覧が表示されます。
                            </p>
                          </>
                        )
                      ) : null}
                      {libraryArtistsLoading && libraryArtistIndexActive ? (
                        <LibraryArtistListLoading />
                      ) : null}
                      {libraryArtistIndexActive &&
                      !libraryArtistsLoading &&
                      browseArtistIndexRows.length === 0 ? (
                        <p className="px-0.5 py-1 text-[10px] text-gray-500">該当するアーティストがありません。</p>
                      ) : null}
                      {libraryArtistIndexActive && browseArtistIndexRows.length > 0 ? (
                        <div className="mc-scrollbar-stable flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setLibrarySelectedArtistName(null);
                              setLibraryRows([]);
                              setLibrarySongSource('idle');
                              setLibrarySelectedSongId(null);
                              setLibrarySongVideos([]);
                              setLibrarySelectedVideoId(null);
                            }}
                            className={`flex w-full shrink-0 items-center justify-between gap-1 rounded px-1.5 py-1.5 text-left text-[10px] ${
                              librarySelectedArtistName === null
                                ? 'bg-lime-700 text-white'
                                : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <span className="min-w-0 truncate">未選択</span>
                          </button>
                          {browseArtistIndexRows.map((a) => (
                            <button
                              key={a.main_artist}
                              type="button"
                              onClick={() => {
                                setLibrarySelectedArtistName(a.main_artist);
                                void loadLibrarySongsForArtist(a.main_artist);
                              }}
                              className={`flex w-full shrink-0 items-center justify-between gap-1 rounded px-1.5 py-1.5 text-left text-[10px] ${
                                librarySelectedArtistName === a.main_artist
                                  ? 'bg-lime-700 text-white'
                                  : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{a.main_artist}</span>
                              <span className="shrink-0 tabular-nums opacity-90">({a.count})</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!libraryLoading &&
                    !libraryError &&
                    librarySongSource === 'search' &&
                    searchArtistNameCandidates.length > 0 && (
                      <div className="flex min-h-0 flex-1 flex-col px-3 py-2 lg:px-2.5">
                        <p className="mb-2 shrink-0 text-[11px] text-gray-500">
                          検索結果のアーティストで絞り込み
                          {libraryArtistLetter ? `（${libraryArtistLetter}）` : ''}
                        </p>
                        <div className="mc-scrollbar-stable flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => setLibrarySelectedArtistName(null)}
                            className={`flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] ${
                              librarySelectedArtistName === null
                                ? 'bg-lime-700 text-white'
                                : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <span className="min-w-0 truncate">全アーティスト</span>
                          </button>
                          {searchArtistRows.map((a) => (
                            <button
                              key={a.main_artist}
                              type="button"
                              onClick={() => setLibrarySelectedArtistName(a.main_artist)}
                              className={`flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-[11px] ${
                                librarySelectedArtistName === a.main_artist
                                  ? 'bg-lime-700 text-white'
                                  : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{a.main_artist}</span>
                              <span className="shrink-0 tabular-nums opacity-90">({a.count})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </section>
              </div>
              {/* 3列目: 選択アーティスト詳細 */}
              <section
                className={`flex min-h-0 flex-col border-b border-lime-900/60 lg:col-span-2 lg:border-b-0 lg:border-r lg:border-r-lime-900/60 ${LIBRARY_MOBILE_PANEL.artistDetail.section} ${libraryMobileArtistDetailSectionExtra(libraryMobileFocus, isMobileLandscape)}`}
              >
                <div
                  className={`shrink-0 border-b border-lime-900/60 px-3 py-2 ${LIBRARY_MOBILE_PANEL.artistDetail.header}`}
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <LibrarySectionTabImage section="artistDetail" active={libraryTabDActive} />
                    {selectedArtistForInfo ? (
                      <p
                        className={`min-w-0 break-words text-xs font-semibold leading-snug text-lime-100/95 max-lg:text-sky-100/95 ${LIBRARY_MOBILE_PANEL.artistDetail.title}`}
                      >
                        {selectedArtistForInfo}
                        {selectedArtistSongCount != null ? (
                          <span className="ml-1 font-normal tabular-nums text-gray-500 max-lg:text-sky-300/70">
                            （{selectedArtistSongCount}曲）
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs ${LIBRARY_MOBILE_PANEL.artistDetail.body}`}
                >
                  {!selectedArtistForInfo ? (
                    libraryEntryIdle ? (
                      <p className="text-gray-500 max-lg:text-sky-200/55">
                        A または B のあと、アーティストを選ぶと詳細が表示されます。
                      </p>
                    ) : (
                      <p className="text-gray-500 max-lg:text-sky-200/55">
                        C でアーティストを選ぶと詳細が表示されます。
                      </p>
                    )
                  ) : libraryArtistInfoLoading ? (
                    <p className="text-gray-500">読み込み中…</p>
                  ) : libraryArtistInfoError ? (
                    <p className="text-amber-300">{libraryArtistInfoError}</p>
                  ) : libraryDetailMusic8Artist ? (
                    <LibraryArtistDetailMusic8Body
                      artist={libraryDetailMusic8Artist}
                      dbRegistered={Boolean(libraryArtistInfo?.id)}
                    />
                  ) : libraryArtistInfo ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3">
                        {(libraryArtistInfo.image_url ?? '').trim() ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={libraryArtistInfo.image_url as string}
                            alt={libraryArtistInfo.name}
                            className="h-16 w-16 flex-shrink-0 rounded object-cover"
                            loading="lazy"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1 space-y-1 text-gray-300">
                          <p className="font-medium text-gray-100">
                            {libraryArtistInfo.name_ja?.trim() || libraryArtistInfo.name}
                            {(libraryArtistInfo.origin_country ?? '').trim()
                              ? ` (${libraryArtistInfo.origin_country})`
                              : ''}
                          </p>
                          {(libraryArtistInfo.kind ?? '').trim() ? (
                            <p className="lowercase text-gray-400">{libraryArtistInfo.kind}</p>
                          ) : null}
                          {(libraryArtistInfo.active_period ?? '').trim() ? (
                            <p className="text-gray-400">
                              活動期間：{libraryArtistInfo.active_period}
                            </p>
                          ) : null}
                          {(libraryArtistInfo.members ?? '').trim() ? (
                            <p className="text-gray-400">メンバー：{libraryArtistInfo.members}</p>
                          ) : null}
                        </div>
                      </div>
                      {(libraryArtistInfo.profile_text ?? '').trim() ? (
                        <p className="border-t border-gray-700/60 pt-2 leading-relaxed text-gray-400">
                          {libraryArtistInfo.profile_text}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-gray-500">このアーティストの詳細はまだ登録されていません。</p>
                  )}
                </div>
              </section>
              {/* 4列目: 曲一覧 */}
              <section
                className={`flex min-h-0 flex-col border-b border-lime-900/60 lg:col-span-3 lg:border-b-0 lg:border-r lg:border-r-lime-900/60 ${LIBRARY_MOBILE_PANEL.songList.section} ${libraryMobileSongListSectionExtra(libraryMobileFocus, isMobileLandscape)}`}
              >
                <div
                  className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-lime-900/60 px-3 py-2 ${LIBRARY_MOBILE_PANEL.songList.header}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <LibrarySectionTabImage section="songList" active={libraryTabEActive} />
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-x-2 gap-y-1"
                    role="group"
                    aria-label="曲一覧の並べ替え"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">公開日</span>
                      <button
                        type="button"
                        onClick={() => setLibrarySongListSort('release_new')}
                        aria-pressed={librarySongListSort === 'release_new'}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                          librarySongListSort === 'release_new'
                            ? 'bg-lime-700 text-white'
                            : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        NEW
                      </button>
                      <button
                        type="button"
                        onClick={() => setLibrarySongListSort('release_old')}
                        aria-pressed={librarySongListSort === 'release_old'}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                          librarySongListSort === 'release_old'
                            ? 'bg-lime-700 text-white'
                            : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        OLD
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLibrarySongListSort('popularity')}
                      aria-pressed={librarySongListSort === 'popularity'}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        librarySongListSort === 'popularity'
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      人気順
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibrarySongListSort('title_asc')}
                      aria-pressed={librarySongListSort === 'title_asc'}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        librarySongListSort === 'title_asc'
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      A-Z
                    </button>
                  </div>
                </div>
                <div
                  ref={librarySongListScrollRef}
                  className={`mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-2 ${LIBRARY_MOBILE_PANEL.songList.body}`}
                >
                  {libraryLoading ? <LibrarySongListLoading /> : null}
                  {libraryError && <p className="px-2 py-2 text-xs text-amber-300">{libraryError}</p>}
                  {!libraryLoading && !libraryError && filteredLibraryRows.length === 0 && (
                    libraryEntryIdle ? (
                      <LibraryEntryGuide className="mx-1 my-2" />
                    ) : (
                      <p className="px-2 py-2 text-xs text-gray-500 max-lg:text-violet-200/55">
                        {librarySongSource === 'idle'
                          ? '索引で字母を選びアーティストを選ぶか、検索で曲を探せます。'
                          : librarySongSource === 'search'
                            ? '候補がありません。別のキーワードを試してください。'
                            : '候補がありません。'}
                      </p>
                    )
                  )}
                  <ul className="space-y-1.5">
                    {librarySongRowsSortedForList.map((row) => {
                      const active = row.id === librarySelectedSongId;
                      const releaseDot = formatLibraryReleaseDot(row.original_release_date);
                      const metaMid = `${row.main_artist ?? '—'} / ${row.style ?? '—'}`;
                      const playBits = [
                        `全選曲 ${row.play_count ?? 0}`,
                        row.my_play_count != null ? `自分 ${row.my_play_count}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setLibrarySelectedSongId(row.id);
                              setLibraryCopyState('idle');
                            }}
                            className={`w-full rounded border px-3 py-2 text-left ${
                              active
                                ? 'border-lime-500/70 bg-lime-950/40'
                                : 'border-gray-800 bg-gray-900/60 hover:bg-gray-900'
                            }`}
                          >
                            <p className="line-clamp-2 text-sm font-medium text-gray-100">
                              {librarySongListPrimaryTitle(row)}
                            </p>
                            <p className="mt-1 text-[11px] leading-snug text-gray-400">
                              {releaseDot ? (
                                <>
                                  <span className="tabular-nums text-gray-300">{releaseDot}</span>
                                  <span className="text-gray-600"> · </span>
                                </>
                              ) : null}
                              <span className="break-words">{metaMid}</span>
                              <span className="text-gray-600"> · </span>
                              <span className="tabular-nums text-gray-500">{playBits}</span>
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
              {isMobileLandscape && selectedLibraryRow ? (
                <section className="min-h-0 grid grid-cols-[minmax(0,0.68fr)_minmax(0,0.32fr)] gap-2 max-lg:col-span-2">
                  <div className="mc-scrollbar-stable min-h-0 overflow-y-auto rounded-lg border border-amber-700/55 bg-amber-950/35 p-2.5">
                    <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
                      <p className="text-sm font-medium text-gray-100">{selectedLibraryRow.title}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {librarySongArtists.artistsLine} / {selectedLibraryRow.style ?? '—'}
                      </p>
                    </div>
                    <div className="mb-2">
                      <p className="mb-1 text-[11px] text-gray-500">動画バージョン</p>
                      {libraryVideoLoading ? (
                        <p className="text-xs text-gray-500">読み込み中…</p>
                      ) : libraryVideoError ? (
                        <p className="text-xs text-amber-300">{libraryVideoError}</p>
                      ) : librarySongVideos.length === 0 ? (
                        <p className="text-xs text-gray-500">候補動画がありません。</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {librarySongVideos.map((v) => {
                            const active = v.video_id === librarySelectedVideoId;
                            return (
                              <button
                                key={`landscape-variant-${v.video_id}`}
                                type="button"
                                onClick={() => {
                                  setLibrarySelectedVideoId(v.video_id);
                                  setLibraryCopyState('idle');
                                }}
                                className={`rounded px-2 py-1 text-xs ${
                                  active
                                    ? 'bg-lime-700 text-white'
                                    : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                                }`}
                              >
                                {libraryVariantLabel(v.variant)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {librarySelectedVideoId ? (
                      <div className="aspect-video overflow-hidden rounded border border-gray-800 bg-black">
                        <iframe
                          title="Library landscape preview"
                          src={`https://www.youtube.com/embed/${encodeURIComponent(
                            librarySelectedVideoId,
                          )}?autoplay=1&controls=1&modestbranding=1`}
                          className="h-full w-full"
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded border border-gray-800 bg-black/50 text-xs text-gray-500">
                        動画候補を選んでください
                      </div>
                    )}
                  </div>
                  <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-amber-700/55 bg-amber-950/35 p-2.5">
                    <button
                      type="button"
                      disabled={!onVideoUrl || !selectedLibraryUrl}
                      className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-2 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
                      onClick={submitLibrarySongSelection}
                    >
                      この曲を選曲
                    </button>
                    <button
                      type="button"
                      disabled={!selectedLibraryUrl}
                      className="h-11 rounded border border-gray-600 bg-gray-800 px-2 text-sm text-gray-100 hover:bg-gray-700"
                      onClick={() => {
                        void copyLibraryUrl();
                      }}
                    >
                      URLをコピー
                    </button>
                    {!isGuest && onSystemMessage ? (
                      <button
                        type="button"
                        disabled={!selectedLibraryUrl || libraryMyListAddBusy}
                        className="h-11 rounded border border-violet-600/60 bg-violet-900/40 px-2 text-sm font-semibold text-violet-100 hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-50"
                        title="マイページのマイリストに追加（部屋の選曲とは別）"
                        onClick={() => {
                          void addLibrarySelectionToMyList();
                        }}
                      >
                        {libraryMyListAddBusy ? '追加中…' : 'マイリスト追加'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={clearLibrarySongSelection}
                      className="h-9 rounded border border-amber-500/60 bg-amber-950/60 px-2 text-xs font-medium text-amber-100 hover:bg-amber-900/70"
                      aria-label="選択した曲を解除"
                      title="選択した曲を解除"
                    >
                      X 解除
                    </button>
                    {libraryCopyState !== 'idle' ? (
                      <p className="mt-1 text-[11px] text-gray-300">
                        {libraryCopyState === 'ok' ? 'URLをコピーしました。' : 'URLコピーに失敗しました。'}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {/* 5列目: 曲詳細・動画 */}
              {isLg && (
              <section className="min-h-0 flex-col lg:col-span-4 lg:flex">
                <div className="border-b border-lime-900/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <LibrarySectionTabImage section="songDetail" active={libraryTabFActive} />
                    <p className="text-[11px] text-gray-400">
                      {libraryEntryIdle
                        ? '曲を選ぶと、動画バージョン（公式優先）を選べます。'
                        : 'E の曲一覧で選ぶと、動画バージョン（公式優先）を選べます。'}
                    </p>
                  </div>
                </div>
                <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-3">
                  {selectedLibraryRow ? (
                    <>
                      <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
                        <p className="text-sm font-medium text-gray-100">{selectedLibraryRow.title}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {librarySongArtists.artistsLine} / {selectedLibraryRow.style ?? '—'}
                        </p>
                      </div>
                      <div className="mb-2">
                        <p className="mb-1 text-[11px] text-gray-500">動画バージョン</p>
                        {libraryVideoLoading ? (
                          <p className="text-xs text-gray-500">読み込み中…</p>
                        ) : libraryVideoError ? (
                          <p className="text-xs text-amber-300">{libraryVideoError}</p>
                        ) : librarySongVideos.length === 0 ? (
                          <p className="text-xs text-gray-500">候補動画がありません。</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {librarySongVideos.map((v) => {
                              const active = v.video_id === librarySelectedVideoId;
                              return (
                                <button
                                  key={v.video_id}
                                  type="button"
                                  onClick={() => {
                                    setLibrarySelectedVideoId(v.video_id);
                                    setLibraryCopyState('idle');
                                  }}
                                  className={`rounded px-2 py-1 text-xs ${
                                    active
                                      ? 'bg-lime-700 text-white'
                                      : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                                  }`}
                                >
                                  {libraryVariantLabel(v.variant)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {librarySelectedVideoId ? (
                        <div className="aspect-video overflow-hidden rounded border border-gray-800 bg-black">
                          <iframe
                            title="Library preview"
                            src={`https://www.youtube.com/embed/${encodeURIComponent(
                              librarySelectedVideoId,
                            )}?autoplay=1&controls=1&modestbranding=1`}
                            className="h-full w-full"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-video items-center justify-center rounded border border-gray-800 bg-black/50 text-xs text-gray-500">
                          動画候補を選んでください
                        </div>
                      )}
                      <div className={libraryDetailActionGridClass}>
                        <button
                          type="button"
                          disabled={!onVideoUrl || !selectedLibraryUrl}
                          className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
                          onClick={submitLibrarySongSelection}
                        >
                          この曲を選曲
                        </button>
                        <button
                          type="button"
                          disabled={!selectedLibraryUrl}
                          className="h-11 rounded border border-gray-600 bg-gray-800 px-3 text-sm text-gray-100 hover:bg-gray-700"
                          onClick={() => {
                            void copyLibraryUrl();
                          }}
                        >
                          URLをコピー
                        </button>
                        {!isGuest && onSystemMessage ? (
                          <button
                            type="button"
                            disabled={!selectedLibraryUrl || libraryMyListAddBusy}
                            className="h-11 rounded border border-violet-600/60 bg-violet-900/40 px-3 text-sm font-semibold text-violet-100 hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-50"
                            title="マイページのマイリストに追加（部屋の選曲とは別）"
                            onClick={() => {
                              void addLibrarySelectionToMyList();
                            }}
                          >
                            {libraryMyListAddBusy ? '追加中…' : 'マイリスト追加'}
                          </button>
                        ) : null}
                      </div>
                      {libraryCopyState !== 'idle' && (
                        <p className="mt-2 text-xs text-gray-300">
                          {libraryCopyState === 'ok'
                            ? 'URLをコピーしました。'
                            : 'URLコピーに失敗しました。'}
                        </p>
                      )}
                      {selectedLibraryRow && (
                        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-gray-300">
                          <LibrarySongArtistsDetail
                            artists={librarySongArtists.artists}
                            loading={librarySongArtists.loading}
                            fallbackMainArtist={selectedLibraryRow.main_artist}
                            onSelectArtist={switchLibraryToArtist}
                          />
                          {[
                            ['曲タイトル', selectedLibraryRow.song_title],
                            ['スタイル', selectedLibraryRow.style],
                            ['ジャンル', selectedLibraryRow.genres],
                            [
                              '公開日',
                              selectedLibraryRow.original_release_date
                                ? selectedLibraryRow.original_release_date.slice(0, 7)
                                : null,
                            ],
                            ['ボーカル', selectedLibraryRow.vocal],
                            ['選曲回数', selectedLibraryRow.play_count != null ? String(selectedLibraryRow.play_count) : null],
                          ]
                            .filter(([, v]) => v != null && v !== '')
                            .map(([label, value]) => (
                              <Fragment key={label}>
                                <dt className="whitespace-nowrap text-gray-500">{label}：</dt>
                                <dd className="min-w-0 break-words">{value}</dd>
                              </Fragment>
                            ))}
                        </dl>
                      )}
                      {selectedLibraryRow ? (
                        <LibraryMusic8SongComment
                          videoId={librarySelectedVideoId}
                          artistName={
                            librarySongArtists.artists?.[0]?.name ?? selectedLibraryRow.main_artist
                          }
                          songTitle={selectedLibraryRow.song_title ?? selectedLibraryRow.title}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">
                      E の曲一覧から曲を選んでください（A・B で絞り込めます）。
                    </p>
                  )}
                </div>
              </section>
              )}
            </div>
            {!isLg && !isMobileLandscape && selectedLibraryRow ? (
              <section
                className={`flex min-h-0 flex-col border-t-2 border-amber-600/50 bg-amber-950/40 lg:hidden ${
                  libraryMobileFocus === 'split'
                    ? 'max-lg:flex-1 max-lg:min-h-0 max-lg:basis-1/2 max-lg:border-t max-lg:shadow-none'
                    : 'max-lg:hidden'
                }`}
              >
              <div className="flex items-center justify-between gap-2 border-b border-amber-700/45 bg-amber-900/50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <LibrarySectionTabImage section="songDetail" active={libraryTabFActive} />
                  <p className="truncate text-xs font-medium text-amber-50">
                    曲・動画を選ぶ（E の曲一覧で曲を選択）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearLibrarySongSelection}
                  className="shrink-0 rounded border border-amber-500/60 bg-amber-950/60 px-2 py-0.5 text-[11px] font-medium text-amber-100 hover:bg-amber-900/70"
                  aria-label="選択した曲を解除"
                  title="選択した曲を解除"
                >
                  X 解除
                </button>
              </div>
              <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-3">
                  <>
                    <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
                      <p className="text-sm font-medium text-gray-100">{selectedLibraryRow.title}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {librarySongArtists.artistsLine} / {selectedLibraryRow.style ?? '—'}
                      </p>
                    </div>
                    <div className="mb-2">
                      <p className="mb-1 text-[11px] text-gray-500">動画バージョン</p>
                      {libraryVideoLoading ? (
                        <p className="text-xs text-gray-500">読み込み中…</p>
                      ) : libraryVideoError ? (
                        <p className="text-xs text-amber-300">{libraryVideoError}</p>
                      ) : librarySongVideos.length === 0 ? (
                        <p className="text-xs text-gray-500">候補動画がありません。</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {librarySongVideos.map((v) => {
                            const active = v.video_id === librarySelectedVideoId;
                            return (
                              <button
                                key={v.video_id}
                                type="button"
                                onClick={() => {
                                  setLibrarySelectedVideoId(v.video_id);
                                  setLibraryCopyState('idle');
                                }}
                                className={`rounded px-2 py-1 text-xs ${
                                  active
                                    ? 'bg-lime-700 text-white'
                                    : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                                }`}
                              >
                                {libraryVariantLabel(v.variant)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {librarySelectedVideoId ? (
                      <div className="aspect-video overflow-hidden rounded border border-gray-800 bg-black">
                        <iframe
                          title="Library preview"
                          src={`https://www.youtube.com/embed/${encodeURIComponent(
                            librarySelectedVideoId,
                          )}?autoplay=1&controls=1&modestbranding=1`}
                          className="h-full w-full"
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded border border-gray-800 bg-black/50 text-xs text-gray-500">
                        動画候補を選んでください
                      </div>
                    )}
                    <div className={libraryDetailActionGridClass}>
                      <button
                        type="button"
                        disabled={!onVideoUrl || !selectedLibraryUrl}
                        className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
                        onClick={submitLibrarySongSelection}
                      >
                        この曲を選曲
                      </button>
                      <button
                        type="button"
                        disabled={!selectedLibraryUrl}
                        className="h-11 rounded border border-gray-600 bg-gray-800 px-3 text-sm text-gray-100 hover:bg-gray-700"
                        onClick={() => {
                          void copyLibraryUrl();
                        }}
                      >
                        URLをコピー
                      </button>
                      {!isGuest && onSystemMessage ? (
                        <button
                          type="button"
                          disabled={!selectedLibraryUrl || libraryMyListAddBusy}
                          className="h-11 rounded border border-violet-600/60 bg-violet-900/40 px-3 text-sm font-semibold text-violet-100 hover:bg-violet-900/60 disabled:cursor-not-allowed disabled:opacity-50"
                          title="マイページのマイリストに追加（部屋の選曲とは別）"
                          onClick={() => {
                            void addLibrarySelectionToMyList();
                          }}
                        >
                          {libraryMyListAddBusy ? '追加中…' : 'マイリスト追加'}
                        </button>
                      ) : null}
                    </div>
                  </>
                </div>
              </section>
            ) : null}
            {libraryLetterModalOpen && (
              <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-3 lg:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="アーティスト頭文字を選択"
                onClick={() => setLibraryLetterModalOpen(false)}
              >
                <div
                  className="w-full max-w-sm rounded-lg border border-lime-800/70 bg-gray-950 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-lime-100">アーティスト頭文字</p>
                    <button
                      type="button"
                      onClick={() => setLibraryLetterModalOpen(false)}
                      className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
                    >
                      閉じる
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {libraryLetterKeys.map((L) => (
                      <button
                        key={`modal-${L}`}
                        type="button"
                        onClick={() => {
                          void selectLibraryArtistIndex(L);
                          setLibraryLetterModalOpen(false);
                        }}
                        className={`rounded px-1.5 py-2 text-[11px] font-semibold ${
                          libraryArtistIndexActive && libraryArtistLetter === L
                            ? 'bg-lime-700 text-white'
                            : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                        }`}
                        aria-label={
                          L === LIBRARY_MODAL_INDEX_HASH
                            ? '0から9の数字または記号で始まるアーティスト'
                            : undefined
                        }
                      >
                        {L === LIBRARY_MODAL_INDEX_HASH ? '0-9' : L}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-lime-900/60 pt-2">
                    <p className="mb-1 text-[11px] text-gray-400">
                      アーティスト一覧
                      {libraryArtistLetter ? `（${libraryArtistLetter}）` : ''}
                    </p>
                    <div className="mc-scrollbar-stable max-h-60 overflow-y-auto">
                      <div className="flex flex-col gap-1">
                        {libraryArtistsLoading && libraryArtistIndexActive ? (
                          <LibraryArtistListLoading compact />
                        ) : modalArtistRows.length === 0 ? (
                          <p className="rounded border border-gray-800 bg-gray-900 px-2 py-2 text-xs text-gray-500">
                            {libraryArtistLetter
                              ? '該当アーティストがありません。'
                              : '頭文字を選ぶと一覧が表示されます。'}
                          </p>
                        ) : (
                          modalArtistRows.map((a) => (
                            <button
                              key={`modal-artist-${a.main_artist}`}
                              type="button"
                              onClick={() => {
                                setLibrarySelectedArtistName(a.main_artist);
                                setLibrarySelectedSongId(null);
                                setLibrarySongVideos([]);
                                setLibrarySelectedVideoId(null);
                                setLibraryVideoError(null);
                                void loadLibrarySongsForArtist(a.main_artist);
                                setLibraryLetterModalOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                                librarySelectedArtistName === a.main_artist
                                  ? 'bg-lime-700 text-white'
                                  : 'border border-gray-700 bg-gray-900 text-gray-200 hover:bg-gray-800'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{a.main_artist}</span>
                              <span className="ml-2 shrink-0 tabular-nums opacity-90">({a.count})</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-2">
        {roomInteractionLocked ? (
          <p className="mb-2 rounded border border-amber-700/50 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
            別の端末で操作中のため、この端末では送信できません。上部の「この端末で操作する」から切り替えてください。
          </p>
        ) : null}
        <div className="flex w-full flex-row flex-wrap items-stretch gap-2">
          <div className="w-full min-w-0 sm:flex-1 sm:basis-[min(100%,12rem)]">
            <input
              ref={inputRef}
              type="text"
              placeholder={
                roomInteractionLocked
                  ? '別の端末で操作中…'
                  : isYoutubeKeywordSearchEnabled()
                    ? '会話・URL・アーティスト・曲名のどれでも入力…'
                    : '会話・YouTubeのURL・AIへの質問は、@質問内容…を入力して送信ボタン'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (roomInteractionLocked) return;
                if (e.key !== 'Enter' || e.shiftKey) return;
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                handleSubmit();
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={roomInteractionLocked}
              readOnly={roomInteractionLocked}
              className={`box-border h-[3.75rem] w-full min-w-0 rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 outline-none focus:border-blue-500 ${
                roomInteractionLocked ? 'cursor-not-allowed opacity-60' : ''
              }`}
              aria-label="チャット入力"
              aria-disabled={roomInteractionLocked}
            />
          </div>
          {themePlaylistRoomSubmit && onVideoUrl ? (
            <div className="hidden h-[3.75rem] shrink-0 flex-col justify-center gap-1 sm:flex">
              <button
                type="button"
                onClick={openThemePlaylistConfirm}
                title={`お題「${themePlaylistRoomSubmit.themeLabel}」として記録し、曲解説のあとにお題講評が付きます（確認のあと送信）`}
                className="box-border flex min-h-0 flex-1 items-center justify-center rounded border border-amber-500/80 bg-amber-900/50 px-2 text-[11px] font-semibold leading-tight text-amber-50 hover:bg-amber-800/60 disabled:opacity-50"
                disabled={roomInteractionLocked || !value.trim() || !extractVideoId(value.trim())}
                aria-haspopup="dialog"
                aria-expanded={themePlaylistConfirmOpen}
              >
                お題曲送信（β）
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                title="YouTubeのURLならプレイヤーに反映（お題には紐づけません）。それ以外はチャットに表示"
                className="box-border flex min-h-0 flex-1 items-center justify-center rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
                disabled={roomInteractionLocked || !value.trim()}
              >
                送信
              </button>
            </div>
          ) : showDualSongButtons ? (
            <div className="hidden h-[3.75rem] shrink-0 flex-col justify-center gap-1 sm:flex">
              <button
                type="button"
                onClick={() => submitVideoUrl('full')}
                title="AI 解説・クイズ等付き（お試し 1 曲消費）"
                className="box-border flex min-h-0 flex-1 items-center justify-center rounded bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                disabled={roomInteractionLocked || !trimmedInput}
              >
                AI付きで選曲
              </button>
              <button
                type="button"
                onClick={() => submitVideoUrl('none')}
                title="再生・チャットのみ（無料）"
                className="box-border flex min-h-0 flex-1 items-center justify-center rounded border border-blue-500/70 bg-blue-900/30 px-3 text-xs font-medium text-blue-100 hover:bg-blue-900/50 disabled:opacity-50"
                disabled={roomInteractionLocked || !trimmedInput}
              >
                AIなしで選曲
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              title={
                urlVideoIdInInput
                  ? showDualSongButtons
                    ? 'YouTubeのURLを選曲（AI付き・お試し1曲消費）。AIなしは下のボタン'
                    : 'YouTubeのURLを選曲（AI付き）。登録ユーザーはお試し枠内で解説が付きます'
                  : 'YouTubeのURLならプレイヤーに反映。それ以外はチャットに表示'
              }
              className="box-border hidden h-[3.75rem] shrink-0 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 sm:flex"
              disabled={roomInteractionLocked || !value.trim()}
            >
              {urlVideoIdInInput && !isGuest ? '選曲' : '送信'}
            </button>
          )}
          <div className="flex w-full items-center gap-2 sm:hidden">
            {showDualSongButtons ? (
              <>
                <button
                  type="button"
                  onClick={() => submitVideoUrl('full')}
                  className="box-border flex h-11 min-w-0 flex-1 basis-1/2 items-center justify-center rounded bg-violet-700 px-2 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
                  disabled={roomInteractionLocked || !trimmedInput}
                >
                  AI付き選曲
                </button>
                <button
                  type="button"
                  onClick={() => submitVideoUrl('none')}
                  className="box-border flex h-11 min-w-0 flex-1 basis-1/2 items-center justify-center rounded border border-blue-500/70 bg-blue-900/30 px-2 text-xs font-medium text-blue-100 disabled:opacity-50"
                  disabled={roomInteractionLocked || !trimmedInput}
                >
                  AIなし選曲
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                title="YouTubeのURLならプレイヤーに反映。それ以外はチャットに表示"
                className="box-border flex h-11 min-w-0 flex-1 basis-1/2 items-center justify-center rounded bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
                disabled={roomInteractionLocked || !value.trim()}
              >
                {urlVideoIdInInput && !isGuest ? '選曲' : '送信'}
              </button>
            )}
            {onVideoUrl ? (
              <button
                type="button"
                onClick={openLibraryModal}
                title="ライブラリから曲を選んで再生・URLコピー"
                className="box-border flex h-11 min-w-0 flex-1 basis-1/2 items-center justify-center gap-1 rounded border border-lime-500/60 bg-lime-900/20 px-3 text-sm font-medium text-lime-100 hover:bg-lime-900/35"
                aria-label="ライブラリを開く"
              >
                <FolderIcon className="h-4 w-4" aria-hidden />
                <span>ライブラリ</span>
              </button>
            ) : null}
          </div>
          <div className="hidden h-[3.75rem] shrink-0 items-center gap-2 sm:flex">
            <div className="flex min-h-0 flex-col items-start justify-center gap-0.5">
              <button
                type="button"
                onClick={() => setSongHowtoOpen(true)}
                className="inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-sky-700/60 bg-sky-900/20 px-2 text-left text-xs leading-tight text-sky-100 hover:bg-sky-800/35"
                aria-haspopup="dialog"
                aria-expanded={songHowtoOpen}
                aria-label="選曲方法（説明を表示）"
                title="選曲方法"
              >
                <MusicalNoteIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span>選曲方法</span>
              </button>
              <button
                type="button"
                onClick={() => setUsageGuideOpen(true)}
                className="inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-amber-700/60 bg-amber-900/20 px-2 text-left text-xs leading-tight text-amber-100 hover:bg-amber-800/35"
                aria-haspopup="dialog"
                aria-expanded={usageGuideOpen}
                aria-label="発言方法（説明を表示）"
                title="発言方法"
              >
                <QuestionMarkCircleIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span>発言方法</span>
              </button>
            </div>
            <div className="flex min-h-0 flex-col items-start justify-center gap-0.5">
              {onOpenTerms && (
                <button
                  type="button"
                  onClick={onOpenTerms}
                  className="inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-gray-700 bg-gray-800/55 px-2 text-left text-xs leading-tight text-gray-100 hover:bg-gray-700/75"
                  aria-label="利用規約"
                  title="利用規約"
                >
                  <DocumentTextIcon className="h-3 w-3 shrink-0" aria-hidden />
                  <span>利用規約</span>
                </button>
              )}
              {onOpenSiteFeedback && (
                <button
                  type="button"
                  onClick={onOpenSiteFeedback}
                  className="inline-flex h-[1.8rem] min-h-0 items-center gap-1 rounded border border-gray-700 bg-gray-800/55 px-2 text-left text-xs leading-tight text-gray-100 hover:bg-gray-700/75"
                  aria-label="このサイトへのご意見"
                  title="このサイトへのご意見"
                >
                  <EnvelopeIcon className="h-3 w-3 shrink-0" aria-hidden />
                  <span>ご意見</span>
                </button>
              )}
            </div>
          </div>
          <div className="order-last flex w-full items-center gap-2 pt-0.5 text-xs leading-tight sm:hidden">
            {onOpenTerms && (
              <button
                type="button"
                onClick={onOpenTerms}
                className="inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-gray-700 bg-gray-800/55 px-2 text-gray-100 hover:bg-gray-700/75"
                aria-label="利用規約"
                title="利用規約"
              >
                <DocumentTextIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span>利用規約</span>
              </button>
            )}
            {onOpenSiteFeedback && (
              <button
                type="button"
                onClick={onOpenSiteFeedback}
                className="inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-gray-700 bg-gray-800/55 px-2 text-gray-100 hover:bg-gray-700/75"
                aria-label="このサイトへのご意見"
                title="このサイトへのご意見"
              >
                <EnvelopeIcon className="h-3 w-3 shrink-0" aria-hidden />
                <span>ご意見</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSongHowtoOpen(true)}
              className="inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-sky-700/60 bg-sky-900/20 px-2 text-sky-100 hover:bg-sky-800/35"
              aria-haspopup="dialog"
              aria-expanded={songHowtoOpen}
              aria-label="選曲方法（説明を表示）"
              title="選曲方法"
            >
              <MusicalNoteIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span>選曲方法</span>
            </button>
            <button
              type="button"
              onClick={() => setUsageGuideOpen(true)}
              className="inline-flex h-[1.8rem] items-center gap-1 whitespace-nowrap rounded border border-amber-700/60 bg-amber-900/20 px-2 text-amber-100 hover:bg-amber-800/35"
              aria-haspopup="dialog"
              aria-expanded={usageGuideOpen}
              aria-label="発言方法（説明を表示）"
              title="発言方法"
            >
              <QuestionMarkCircleIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span>発言方法</span>
            </button>
          </div>
          {onVideoUrl && isYoutubeKeywordSearchEnabled() ? (
            <button
              type="button"
              onClick={handleSearchAndPlay}
              title="キーワードでYouTube検索し、結果一覧を表示（URLを入れた場合は送信と同じくプレイヤーへ）"
              className="box-border flex h-[3.75rem] shrink-0 items-center justify-center rounded border border-blue-500/60 bg-blue-900/20 px-4 text-sm font-medium text-blue-200 hover:bg-blue-900/35 disabled:opacity-50"
              disabled={!value.trim() || searching}
              aria-label="曲名・キーワードで検索"
            >
              {searching ? '…' : '検索'}
            </button>
          ) : null}
          {onVideoUrl ? (
            <button
              type="button"
              onClick={openLibraryModal}
              title="ライブラリから曲を選んで再生・URLコピー"
              className="box-border hidden h-[3.75rem] shrink-0 items-center justify-center gap-1 rounded border border-lime-500/60 bg-lime-900/20 px-4 text-sm font-medium text-lime-100 hover:bg-lime-900/35 sm:flex"
              aria-label="ライブラリを開く"
            >
              <FolderIcon className="h-4 w-4" aria-hidden />
              <span>ライブラリ</span>
            </button>
          ) : null}
          {trailingSlot != null && trailingSlot !== false ? (
            <div className="flex h-[3.75rem] min-w-0 shrink-0 items-center">{trailingSlot}</div>
          ) : null}
        </div>
      </div>
    </>
  );
});

export default ChatInput;
