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
import { NON_YOUTUBE_URL_SYSTEM_MESSAGE } from '@/lib/chat-non-youtube-url';
import { extractVideoId, isStandaloneNonYouTubeUrl } from '@/lib/youtube';
import type { SystemMessageOptions } from '@/types/chat';
import { isAiQuestionGuardDisabledClient } from '@/lib/chat-system-copy';
import {
  DocumentTextIcon,
  EnvelopeIcon,
  FolderIcon,
  MusicalNoteIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import { SongSelectionHowtoModal } from '@/components/chat/SongSelectionHowtoModal';
import { isYoutubeKeywordSearchEnabled } from '@/lib/youtube-keyword-search-ui';

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
 * 左サイド索引：「全」の次は数字・記号バケット（1ボタン）、続けて A–Z、その他。
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
}

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onVideoUrl?: (
    url: string,
    opts?: { themePlaylistThemeId?: string | null; themePlaylistThemeLabel?: string | null },
  ) => void;
  /** ゲスト時は検索APIの制限を低めにするために送る */
  isGuest?: boolean;
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
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSendMessage,
    onVideoUrl,
    isGuest = false,
    onSystemMessage,
    onAddCandidate,
    onPreviewStart,
    onPreviewStop,
    trailingSlot,
    onClearLocalAiQuestionGuard,
    onOpenTerms,
    onOpenSiteFeedback,
    themePlaylistRoomSubmit = null,
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
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryRows, setLibraryRows] = useState<LibrarySongRow[]>([]);
  /** 索引は DB 全件（管理ライブラリと同じ）。未取得時は検索結果から頭文字を組み立てる */
  const [libraryArtistItems, setLibraryArtistItems] = useState<LibraryArtistIndexRow[]>([]);
  const [libraryIndexLetters, setLibraryIndexLetters] = useState<string[]>([]);
  const [libraryArtistsLoading, setLibraryArtistsLoading] = useState(false);
  const [libraryArtistsError, setLibraryArtistsError] = useState<string | null>(null);
  /** idle=索引のみ／browse=アーティスト別全曲API／search=キーワード検索API */
  const [librarySongSource, setLibrarySongSource] = useState<'idle' | 'browse' | 'search'>('idle');
  /** 曲一覧: 公開日で並べ替え（NEW=新しい順・OLD=古い順） */
  const [librarySongReleaseSort, setLibrarySongReleaseSort] = useState<'new' | 'old'>('new');
  /** null = 全件表示。A–Z / # / その他 で main_artist 先頭に応じて絞り込み */
  const [libraryArtistLetter, setLibraryArtistLetter] = useState<string | null>(null);
  /** null = アーティスト未選択（レター内の全曲）。指定時は当該アーティスト曲に絞る */
  const [librarySelectedArtistName, setLibrarySelectedArtistName] = useState<string | null>(null);
  const [librarySelectedSongId, setLibrarySelectedSongId] = useState<string | null>(null);
  const [librarySongVideos, setLibrarySongVideos] = useState<LibrarySongVideoRow[]>([]);
  const [librarySelectedVideoId, setLibrarySelectedVideoId] = useState<string | null>(null);
  const [libraryVideoLoading, setLibraryVideoLoading] = useState(false);
  const [libraryVideoError, setLibraryVideoError] = useState<string | null>(null);
  const [libraryArtistInfo, setLibraryArtistInfo] = useState<LibraryArtistInfo | null>(null);
  const [libraryArtistInfoLoading, setLibraryArtistInfoLoading] = useState(false);
  const [libraryArtistInfoError, setLibraryArtistInfoError] = useState<string | null>(null);
  const [libraryLetterModalOpen, setLibraryLetterModalOpen] = useState(false);
  const [libraryCopyState, setLibraryCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
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
    }),
    [runYoutubeKeywordSearch],
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
    return () =>
      window.removeEventListener(MUSICAI_EXTENSION_SET_CHAT_TEXT_EVENT, onExtensionSetText);
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (videoId && onVideoUrl) {
      onVideoUrl(trimmed);
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

  const loadLibraryArtists = useCallback(async () => {
    setLibraryArtistsLoading(true);
    setLibraryArtistsError(null);
    try {
      const res = await fetch('/api/library/artists');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLibraryArtistItems([]);
        setLibraryIndexLetters([]);
        setLibraryArtistsError(
          typeof data?.error === 'string' ? data.error : 'アーティスト一覧の取得に失敗しました。',
        );
        return;
      }
      setLibraryArtistItems(Array.isArray(data?.items) ? data.items : []);
      setLibraryIndexLetters(Array.isArray(data?.letters) ? data.letters : []);
    } catch {
      setLibraryArtistItems([]);
      setLibraryIndexLetters([]);
      setLibraryArtistsError('アーティスト一覧の取得に失敗しました。');
    } finally {
      setLibraryArtistsLoading(false);
    }
  }, []);

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
        setLibraryArtistInfoError(
          typeof data?.error === 'string' ? data.error : 'アーティスト情報の取得に失敗しました。',
        );
        return;
      }
      const a = data?.artist;
      if (!a || typeof a !== 'object') {
        setLibraryArtistInfo(null);
        return;
      }
      setLibraryArtistInfo({
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
      });
    } catch {
      setLibraryArtistInfo(null);
      setLibraryArtistInfoError('アーティスト情報の取得に失敗しました。');
    } finally {
      setLibraryArtistInfoLoading(false);
    }
  }, []);

  const libraryLetterKeys = useMemo(() => {
    if (libraryIndexLetters.length > 0) {
      return buildRoomLibrarySidebarLetters(libraryIndexLetters);
    }
    const set = new Set<string>();
    for (const row of libraryRows) {
      set.add(libraryModalArtistIndexKey(row.main_artist));
    }
    return buildRoomLibrarySidebarLetters(Array.from(set));
  }, [libraryIndexLetters, libraryRows]);

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

  /** 検索モード: 表示中の曲行からユニークなアーティスト名 */
  const searchArtistNameCandidates = useMemo(() => {
    const uniq = new Set<string>();
    for (const row of letterFilteredLibraryRows) {
      const name = (row.main_artist ?? '').trim();
      if (!name) continue;
      uniq.add(name);
    }
    return [...uniq].sort((a, b) => a.localeCompare(b, 'en'));
  }, [letterFilteredLibraryRows]);

  /** ブラウズモード: 索引から（字母＋入力欄の部分一致でアーティスト名を絞り込み） */
  const browseArtistIndexRows = useMemo(() => {
    if (librarySongSource === 'search') return [];
    let items = libraryArtistItems;
    if (libraryArtistLetter !== null) {
      items = items.filter((a) =>
        libraryArtistIndexLetterMatchesSidebarKey(a.indexLetter, libraryArtistLetter),
      );
    }
    const q = libraryQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((a) => a.main_artist.toLowerCase().includes(q));
    }
    return [...items].sort((a, b) =>
      a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' }),
    );
  }, [libraryArtistItems, libraryArtistLetter, librarySongSource, libraryQuery]);

  const modalArtistRows = useMemo(() => {
    let items = libraryArtistItems;
    if (libraryArtistLetter !== null) {
      items = items.filter((a) =>
        libraryArtistIndexLetterMatchesSidebarKey(a.indexLetter, libraryArtistLetter),
      );
    }
    return [...items].sort((a, b) =>
      a.main_artist.localeCompare(b.main_artist, 'en', { sensitivity: 'base' }),
    );
  }, [libraryArtistItems, libraryArtistLetter]);
  const selectedBrowseArtistRow = useMemo(() => {
    if (!librarySelectedArtistName) return null;
    return (
      browseArtistIndexRows.find((a) => a.main_artist === librarySelectedArtistName) ?? null
    );
  }, [browseArtistIndexRows, librarySelectedArtistName]);

  const filteredLibraryRows = useMemo(() => {
    if (!librarySelectedArtistName) return letterFilteredLibraryRows;
    return letterFilteredLibraryRows.filter((r) => (r.main_artist ?? '').trim() === librarySelectedArtistName);
  }, [letterFilteredLibraryRows, librarySelectedArtistName]);

  const librarySongRowsSortedForList = useMemo(() => {
    const rows = [...filteredLibraryRows];
    rows.sort((a, b) => {
      const ta = parseReleaseDateMsForSort(a.original_release_date);
      const tb = parseReleaseDateMsForSort(b.original_release_date);
      const aMissing = ta == null;
      const bMissing = tb == null;
      if (aMissing && bMissing) {
        return (a.title ?? '').localeCompare(b.title ?? '', 'en', { sensitivity: 'base' });
      }
      if (aMissing) return 1;
      if (bMissing) return -1;
      const newerFirst = (tb as number) - (ta as number);
      return librarySongReleaseSort === 'new' ? newerFirst : -newerFirst;
    });
    return rows;
  }, [filteredLibraryRows, librarySongReleaseSort]);

  const selectedLibraryRow =
    libraryOpen && librarySelectedSongId
      ? filteredLibraryRows.find((r) => r.id === librarySelectedSongId) ?? null
      : null;

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
    if (librarySongSource === 'search') {
      if (!searchArtistNameCandidates.some((a) => a === librarySelectedArtistName)) {
        setLibrarySelectedArtistName(null);
      }
    } else {
      if (!browseArtistIndexRows.some((a) => a.main_artist === librarySelectedArtistName)) {
        setLibrarySelectedArtistName(null);
      }
    }
  }, [librarySelectedArtistName, librarySongSource, searchArtistNameCandidates, browseArtistIndexRows]);

  useEffect(() => {
    if (!libraryOpen) return;
    setLibrarySelectedSongId((prev) => (prev && filteredLibraryRows.some((r) => r.id === prev) ? prev : null));
  }, [libraryOpen, filteredLibraryRows]);

  const openLibraryModal = useCallback(() => {
    setLibraryOpen(true);
    setLibraryLetterModalOpen(false);
    setLibraryCopyState('idle');
    setLibraryArtistLetter(null);
    setLibrarySelectedArtistName(null);
    setLibrarySelectedSongId(null);
    setLibrarySongVideos([]);
    setLibrarySelectedVideoId(null);
    setLibraryVideoError(null);
    setLibraryRows([]);
    setLibrarySongSource('idle');
    setLibrarySongReleaseSort('new');
    void loadLibraryArtists();
  }, [loadLibraryArtists]);

  const handleLibrarySearch = useCallback(() => {
    setLibrarySelectedArtistName(null);
    setLibrarySelectedSongId(null);
    setLibrarySongVideos([]);
    setLibrarySelectedVideoId(null);
    setLibraryVideoError(null);
    setLibrarySongSource('search');
    if (librarySongListScrollRef.current) librarySongListScrollRef.current.scrollTop = 0;
    void loadLibraryRows(libraryQuery);
  }, [libraryQuery, loadLibraryRows]);

  const copyLibraryUrl = useCallback(async () => {
    if (!selectedLibraryUrl) return;
    try {
      await navigator.clipboard.writeText(selectedLibraryUrl);
      setLibraryCopyState('ok');
    } catch {
      setLibraryCopyState('fail');
    }
  }, [selectedLibraryUrl]);

  useEffect(() => {
    if (!libraryOpen || !librarySelectedSongId) {
      setLibrarySongVideos([]);
      setLibrarySelectedVideoId(null);
      setLibraryVideoError(null);
      return;
    }
    void loadLibrarySongVideos(librarySelectedSongId);
  }, [libraryOpen, librarySelectedSongId, loadLibrarySongVideos]);
  useEffect(() => {
    if (librarySongListScrollRef.current) librarySongListScrollRef.current.scrollTop = 0;
  }, [librarySelectedArtistName, libraryArtistLetter, librarySongSource]);

  const selectedArtistForInfo = librarySelectedArtistName ?? selectedLibraryRow?.main_artist ?? null;

  useEffect(() => {
    if (!libraryOpen || !selectedArtistForInfo) {
      setLibraryArtistInfo(null);
      setLibraryArtistInfoError(null);
      setLibraryArtistInfoLoading(false);
      return;
    }
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
            className="relative flex h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-lime-600/60 bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-lime-900/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">ライブラリから選曲</h2>
              <button
                type="button"
                className="rounded border border-lime-700/60 bg-gray-800 px-3 py-1.5 text-xs text-lime-100 hover:bg-gray-700"
                onClick={() => setLibraryOpen(false)}
              >
                閉じる
              </button>
            </div>
            <div
              className={`grid min-h-0 flex-1 grid-cols-1 gap-0 ${
                selectedLibraryRow ? 'pb-[38vh]' : 'pb-0'
              } lg:grid-cols-12 lg:pb-0`}
            >
              <aside
                className="hidden max-h-[40vh] flex-col border-b border-lime-900/60 lg:col-span-1 lg:flex lg:max-h-none lg:min-w-0 lg:max-w-[3.5rem] lg:shrink-0 lg:border-b-0 lg:border-r lg:border-r-lime-900/60"
                aria-label="アーティスト頭文字"
              >
                <p className="hidden border-b border-lime-900/50 px-1 py-1 text-[9px] font-medium uppercase leading-tight tracking-wide text-gray-500 lg:block">
                  A–Z
                </p>
                <div className="mc-scrollbar-stable flex min-h-0 flex-1 flex-row flex-wrap gap-0.5 px-1 py-1.5 lg:flex-col lg:flex-nowrap lg:gap-0.5 lg:overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryArtistLetter(null);
                      setLibrarySelectedArtistName(null);
                      setLibraryRows([]);
                      setLibrarySongSource('idle');
                      setLibrarySelectedSongId(null);
                      setLibrarySongVideos([]);
                      setLibrarySelectedVideoId(null);
                    }}
                    aria-pressed={libraryArtistLetter === null}
                    className={`shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold lg:w-full ${
                      libraryArtistLetter === null
                        ? 'bg-lime-700 text-white'
                        : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    全
                  </button>
                  {libraryLetterKeys.map((L) => (
                    <button
                      key={L}
                      type="button"
                      onClick={() => {
                        setLibraryArtistLetter(L);
                        setLibrarySelectedArtistName(null);
                        setLibraryRows([]);
                        setLibrarySongSource('idle');
                        setLibrarySelectedSongId(null);
                        setLibrarySongVideos([]);
                        setLibrarySelectedVideoId(null);
                      }}
                      aria-pressed={libraryArtistLetter === L}
                      aria-label={
                        L === LIBRARY_MODAL_INDEX_HASH
                          ? '0から9の数字または記号で始まるアーティスト'
                          : undefined
                      }
                      className={`shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold tabular-nums lg:w-full ${
                        libraryArtistLetter === L
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
              {/* 2列目: アーティスト（検索・一覧・プロフィール） */}
              <section
                className={`min-h-0 flex-col border-b border-lime-900/60 lg:col-span-3 lg:border-b-0 lg:border-r lg:border-r-lime-900/60 ${
                  selectedLibraryRow ? 'hidden lg:flex' : 'flex'
                }`}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-lime-900/60 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setLibraryLetterModalOpen(true)}
                    className="h-9 shrink-0 rounded border border-lime-500/70 bg-lime-900/30 px-2 text-xs text-lime-100 hover:bg-lime-900/60 lg:hidden"
                    aria-haspopup="dialog"
                    aria-expanded={libraryLetterModalOpen}
                    aria-label="アルファベット索引を開く"
                  >
                    アルファベット索引
                  </button>
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
                    className="h-9 w-full min-w-0 rounded border border-gray-700 bg-gray-900 px-3 text-sm text-gray-100 outline-none focus:border-lime-500"
                  />
                  <button
                    type="button"
                    onClick={handleLibrarySearch}
                    disabled={libraryLoading}
                    className="h-9 shrink-0 rounded border border-lime-500/70 bg-lime-900/30 px-3 text-xs text-lime-100 hover:bg-lime-900/60 disabled:opacity-50"
                  >
                    検索
                  </button>
                </div>
                <div className="mc-scrollbar-stable flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
                  {!libraryArtistsLoading && libraryArtistsError ? (
                    <p className="border-b border-lime-900/50 px-3 py-2 text-[11px] text-amber-300">
                      {libraryArtistsError}
                    </p>
                  ) : null}
                  {libraryArtistsLoading ? (
                    <p className="border-b border-lime-900/50 px-3 py-2 text-[11px] text-gray-500">
                      アーティスト索引を読み込み中…
                    </p>
                  ) : null}
                  {!libraryLoading &&
                    !libraryError &&
                    librarySongSource !== 'search' &&
                    browseArtistIndexRows.length > 0 && (
                      <div
                        className={`border-b border-lime-900/50 px-3 py-2 ${
                          librarySelectedArtistName
                            ? 'sticky top-0 z-10 bg-gray-950/95 backdrop-blur'
                            : ''
                        }`}
                      >
                        <p className="mb-2 text-[11px] text-gray-500">
                          {librarySelectedArtistName
                            ? '選択中アーティスト'
                            : 'アーティスト一覧（タップで全曲を表示）'}
                          {libraryArtistLetter ? `（${libraryArtistLetter}）` : ''}
                        </p>
                        {librarySelectedArtistName ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded bg-lime-700 px-2 py-1.5 text-left text-[11px] text-white"
                            >
                              <span className="min-w-0 truncate">{librarySelectedArtistName}</span>
                              <span className="shrink-0 tabular-nums opacity-90">
                                ({selectedBrowseArtistRow?.count ?? 0})
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLibraryLetterModalOpen(true)}
                              className="shrink-0 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200 hover:bg-gray-800 lg:hidden"
                            >
                              変更
                            </button>
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
                              className="shrink-0 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[11px] text-gray-200 hover:bg-gray-800"
                            >
                              解除
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
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
                              className={`flex w-full shrink-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] ${
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
                                className={`flex w-full shrink-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] ${
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
                        )}
                      </div>
                    )}
                  {!libraryLoading &&
                    !libraryError &&
                    librarySongSource === 'search' &&
                    searchArtistNameCandidates.length > 0 && (
                      <div className="border-b border-lime-900/50 px-3 py-2">
                        <p className="mb-2 text-[11px] text-gray-500">
                          検索結果のアーティストで絞り込み
                          {libraryArtistLetter ? `（${libraryArtistLetter}）` : ''}
                        </p>
                        <div className="mc-scrollbar-stable flex max-h-40 flex-col gap-1 overflow-y-auto">
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
                          {searchArtistNameCandidates.map((name) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => setLibrarySelectedArtistName(name)}
                              className={`flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] ${
                                librarySelectedArtistName === name
                                  ? 'bg-lime-700 text-white'
                                  : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                              }`}
                            >
                              <span className="min-w-0 truncate">{name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  {!libraryLoading && !libraryError && selectedArtistForInfo && (
                    <div className="border-b border-lime-900/50 px-3 py-2 text-xs">
                      {libraryArtistInfoLoading ? (
                        <p className="text-gray-500">読み込み中…</p>
                      ) : libraryArtistInfoError ? (
                        <p className="text-amber-300">{libraryArtistInfoError}</p>
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
                                <p className="text-gray-400">
                                  メンバー：{libraryArtistInfo.members}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {(libraryArtistInfo.profile_text ?? '').trim() ? (
                            <p className="border-t border-gray-700/60 pt-2 leading-relaxed text-gray-400">
                              {libraryArtistInfo.profile_text}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </section>
              {/* 3列目: 曲一覧 */}
              <section className="flex min-h-0 flex-col border-b border-lime-900/60 lg:col-span-3 lg:border-b-0 lg:border-r lg:border-r-lime-900/60">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-lime-900/60 px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-400">曲一覧</p>
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label="公開日で並べ替え"
                  >
                    <span className="text-[10px] text-gray-500">公開日</span>
                    <button
                      type="button"
                      onClick={() => setLibrarySongReleaseSort('new')}
                      aria-pressed={librarySongReleaseSort === 'new'}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                        librarySongReleaseSort === 'new'
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      NEW
                    </button>
                    <button
                      type="button"
                      onClick={() => setLibrarySongReleaseSort('old')}
                      aria-pressed={librarySongReleaseSort === 'old'}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium tabular-nums ${
                        librarySongReleaseSort === 'old'
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      OLD
                    </button>
                  </div>
                </div>
                {!libraryLoading && !libraryError && libraryRows.length > 0 && (
                  <p className="shrink-0 border-b border-lime-900/50 px-3 py-1.5 text-[11px] tabular-nums text-gray-400">
                    {librarySongSource === 'search' ? (
                      <>
                        検索結果{' '}
                        <span className="font-medium text-gray-200">{filteredLibraryRows.length}</span> 曲
                        {libraryArtistLetter !== null ? (
                          <span className="text-gray-600">
                            {' '}
                            （字母 <span className="text-gray-400">{libraryArtistLetter}</span> 内）
                          </span>
                        ) : null}
                        {libraryRows.length >= 100 && libraryQuery.trim() ? (
                          <span className="text-gray-600">（検索は最大100件）</span>
                        ) : null}
                      </>
                    ) : librarySongSource === 'browse' ? (
                      <>
                        表示中{' '}
                        <span className="font-medium text-gray-200">{filteredLibraryRows.length}</span> 曲
                        <span className="text-gray-600">（当該アーティストの全曲）</span>
                      </>
                    ) : (
                      <>
                        表示中{' '}
                        <span className="font-medium text-gray-200">{libraryRows.length}</span> 曲
                      </>
                    )}
                  </p>
                )}
                <div
                  ref={librarySongListScrollRef}
                  className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-2"
                >
                  {libraryLoading && <p className="px-2 py-2 text-xs text-gray-400">読み込み中…</p>}
                  {libraryError && <p className="px-2 py-2 text-xs text-amber-300">{libraryError}</p>}
                  {!libraryLoading && !libraryError && filteredLibraryRows.length === 0 && (
                    <p className="px-2 py-2 text-xs text-gray-500">
                      {librarySongSource === 'idle'
                        ? '左のアーティストをタップすると曲が表示されます。または検索で曲を探せます。'
                        : librarySongSource === 'search'
                          ? '候補がありません。別のキーワードを試してください。'
                          : '候補がありません。'}
                    </p>
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
              {/* 4列目: 曲詳細・動画 */}
              <section className="hidden min-h-0 flex-col lg:col-span-5 lg:flex">
                <div className="border-b border-lime-900/60 px-3 py-2">
                  <p className="text-xs text-gray-400">
                    左の「曲一覧」で選ぶと、動画バージョン（公式優先）を選べます。
                  </p>
                </div>
                <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-3">
                  {selectedLibraryRow ? (
                    <>
                      <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
                        <p className="text-sm font-medium text-gray-100">{selectedLibraryRow.title}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {selectedLibraryRow.main_artist ?? '—'} / {selectedLibraryRow.style ?? '—'}
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
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={!onVideoUrl || !selectedLibraryUrl}
                          className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
                          onClick={() => {
                            if (!onVideoUrl) return;
                            onVideoUrl(selectedLibraryUrl);
                            setValue('');
                            setLibraryOpen(false);
                          }}
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
                          {[
                            ['メインアーティスト', selectedLibraryRow.main_artist],
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
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">
                      左の「曲一覧」から曲を選んでください（索引・検索で絞り込めます）。
                    </p>
                  )}
                </div>
              </section>
            </div>
            {selectedLibraryRow ? (
              <section className="absolute inset-x-0 bottom-0 z-20 flex h-[38vh] min-h-0 flex-col border-t border-lime-900/60 bg-gray-950 lg:hidden">
              <div className="border-b border-lime-900/60 px-3 py-2">
                <p className="text-xs text-gray-400">
                  左の「曲一覧」で選ぶと、動画バージョン（公式優先）を選べます。
                </p>
              </div>
              <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto p-3">
                  <>
                    <div className="mb-2 rounded border border-gray-800 bg-gray-900/60 px-3 py-2">
                      <p className="text-sm font-medium text-gray-100">{selectedLibraryRow.title}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {selectedLibraryRow.main_artist ?? '—'} / {selectedLibraryRow.style ?? '—'}
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
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={!onVideoUrl || !selectedLibraryUrl}
                        className="h-11 rounded border border-lime-500/70 bg-lime-900/40 px-3 text-sm font-semibold text-lime-100 hover:bg-lime-900/70 disabled:opacity-50"
                        onClick={() => {
                          if (!onVideoUrl) return;
                          onVideoUrl(selectedLibraryUrl);
                          setValue('');
                          setLibraryOpen(false);
                        }}
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
                    <button
                      type="button"
                      onClick={() => {
                        setLibraryArtistLetter(null);
                        setLibrarySelectedArtistName(null);
                        setLibraryRows([]);
                        setLibrarySongSource('idle');
                        setLibrarySelectedSongId(null);
                        setLibrarySongVideos([]);
                        setLibrarySelectedVideoId(null);
                        setLibraryLetterModalOpen(false);
                      }}
                      className={`rounded px-1.5 py-2 text-[11px] font-semibold ${
                        libraryArtistLetter === null
                          ? 'bg-lime-700 text-white'
                          : 'border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      全
                    </button>
                    {libraryLetterKeys.map((L) => (
                      <button
                        key={`modal-${L}`}
                        type="button"
                        onClick={() => {
                          setLibraryArtistLetter(L);
                          setLibrarySelectedArtistName(null);
                          setLibraryRows([]);
                          setLibrarySongSource('idle');
                          setLibrarySelectedSongId(null);
                          setLibrarySongVideos([]);
                          setLibrarySelectedVideoId(null);
                          setLibraryLetterModalOpen(false);
                        }}
                        className={`rounded px-1.5 py-2 text-[11px] font-semibold ${
                          libraryArtistLetter === L
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
                      {libraryArtistLetter ? `（${libraryArtistLetter}）` : '（全）'}
                    </p>
                    <div className="mc-scrollbar-stable max-h-60 overflow-y-auto">
                      <div className="flex flex-col gap-1">
                        {modalArtistRows.length === 0 ? (
                          <p className="rounded border border-gray-800 bg-gray-900 px-2 py-2 text-xs text-gray-500">
                            該当アーティストがありません。
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
        <div className="flex w-full flex-row flex-wrap items-stretch gap-2">
          <div className="w-full min-w-0 sm:flex-1 sm:basis-[min(100%,12rem)]">
            <input
              ref={inputRef}
              type="text"
              placeholder={
                isYoutubeKeywordSearchEnabled()
                  ? '会話・URL・アーティスト・曲名のどれでも入力…'
                  : '会話・YouTubeのURL・AIへの質問は、@質問内容…を入力して送信ボタン'
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                if (e.nativeEvent.isComposing) return;
                e.preventDefault();
                handleSubmit();
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              className="box-border h-[3.75rem] w-full min-w-0 rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-500 outline-none focus:border-blue-500"
              aria-label="チャット入力"
            />
          </div>
          {themePlaylistRoomSubmit && onVideoUrl ? (
            <div className="hidden h-[3.75rem] shrink-0 flex-col justify-center gap-1 sm:flex">
              <button
                type="button"
                onClick={openThemePlaylistConfirm}
                title={`お題「${themePlaylistRoomSubmit.themeLabel}」として記録し、曲解説のあとにお題講評が付きます（確認のあと送信）`}
                className="box-border flex min-h-0 flex-1 items-center justify-center rounded border border-amber-500/80 bg-amber-900/50 px-2 text-[11px] font-semibold leading-tight text-amber-50 hover:bg-amber-800/60 disabled:opacity-50"
                disabled={!value.trim() || !extractVideoId(value.trim())}
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
                disabled={!value.trim()}
              >
                送信
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              title="YouTubeのURLならプレイヤーに反映。それ以外はチャットに表示"
              className="box-border hidden h-[3.75rem] shrink-0 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 sm:flex"
              disabled={!value.trim()}
            >
              送信
            </button>
          )}
          <div className="flex w-full items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={handleSubmit}
              title="YouTubeのURLならプレイヤーに反映。それ以外はチャットに表示"
              className="box-border flex h-11 min-w-0 flex-1 basis-1/2 items-center justify-center rounded bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
              disabled={!value.trim()}
            >
              送信
            </button>
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
