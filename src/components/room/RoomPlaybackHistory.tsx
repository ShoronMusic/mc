'use client';

/**
 * ルーム視聴履歴（プレイヤー下）。参加者名・時間・年代・スタイル・アーティスト-タイトル・YouTubeリンク。
 * 固定列幅・はみ出しは...、ソート（時間デフォルト／参加者名）、アクティブ行表示。
 */

import { CalendarDaysIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomPlaybackHistoryRow } from '@/app/api/room-playback-history/route';
import { getArtistAndSong, getMainArtist } from '@/lib/format-song-display';
import { resolveFamousPvArtistSongPack } from '@/lib/youtube-famous-pv-override';
import { getMusic8ArtistJsonUrl } from '@/lib/music8-artist-display';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { SONG_STYLE_OPTIONS } from '@/lib/song-styles';
import MainArtistTabPanel from './MainArtistTabPanel';
import SongDataTabPanel from './SongDataTabPanel';
import EraDistributionModal from './EraDistributionModal';
import StyleDistributionModal from './StyleDistributionModal';

type SortKey = 'played_at' | 'display_name';
type SortOrder = 'desc' | 'asc';

const COL_PARTICIPANT = '参加者名';
const COL_TIME = '時間';
const COL_ARTIST_TITLE = 'アーティスト - タイトル';
const COL_STYLE = 'スタイル';
const COL_ERA = '年代';
const COL_LINK = 'リンク';
const COL_FAV = '♡';

const COL_WIDTH_PARTICIPANT = 68;
const COL_WIDTH_TIME = 52;
/** アーティスト - タイトルは残り幅を使うため minWidth のみ（横スクロールを出さない） */
const COL_MIN_WIDTH_ARTIST_TITLE = 80;
const COL_WIDTH_STYLE = 56;
const COL_WIDTH_ERA = 48;
const COL_WIDTH_LINK = 56;
const COL_WIDTH_FAV = 36;

/**
 * タブ単位で「このルームに滞在し始めた時刻」を保持する。
 * 別日・別グループの再生が同じ room_id に残っていても、後から入った人には見せない。
 */
const PLAYBACK_SESSION_SINCE_STORAGE_PREFIX = 'mc_room_playback_since:v1:';

function getOrCreatePlaybackSessionSinceIso(roomId: string): string {
  if (typeof window === 'undefined') {
    return new Date(0).toISOString();
  }
  const key = `${PLAYBACK_SESSION_SINCE_STORAGE_PREFIX}${roomId}`;
  const existing = sessionStorage.getItem(key);
  if (existing) {
    const t = new Date(existing).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  const now = new Date().toISOString();
  sessionStorage.setItem(key, now);
  return now;
}

/** スタイル値ごとの文字色（背景は従来どおり） */
const STYLE_TEXT_COLORS: Record<string, string> = {
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

/** 年代（十年）列の文字色 */
const ERA_TEXT_COLORS: Record<string, string> = {
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

function getEraTextColor(era: string | null | undefined): string | undefined {
  if (!era || !era.trim()) return undefined;
  return ERA_TEXT_COLORS[era] ?? '#b0bec5';
}

function getStyleTextColor(style: string | null | undefined): string | undefined {
  if (!style || !style.trim()) return undefined;
  return STYLE_TEXT_COLORS[style] ?? STYLE_TEXT_COLORS[style.trim()];
}

function formatPlayedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatPlayedDateWithWeekday(iso: string): { key: string; label: string } | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const weekdayJa = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()] ?? '';
    const key = `${y}-${m}-${day}`;
    const label = `${y}.${m}.${day} (${weekdayJa})`;
    return { key, label };
  } catch {
    return null;
  }
}

/**
 * 視聴履歴の artist_name が「日本語 / English」混在のケースがあるため、
 * music8 の取得に失敗しにくいように「英語っぽい方」を優先してメインアーティストへ正規化する。
 */
function normalizeArtistNameForMusic8Lookup(mixedArtistName: string): string {
  const raw = mixedArtistName?.trim();
  if (!raw) return raw;

  // まずは括弧内の英字がある場合は優先的に抽出する。
  // 例: "... ベット・ミドラー（The Rose / Bette Midler" → "Bette Midler"
  const parenLatinMatch =
    raw.match(/[（(]([^)\r\n]+)$/) ?? raw.match(/[（(]([^)\r\n]+)[)）]/);
  const parenLatin = parenLatinMatch?.[1] ? String(parenLatinMatch[1]) : '';
  if (parenLatin && /[A-Za-z]/.test(parenLatin)) {
    const segs = parenLatin.split(/\s*[\/／]\s*/).map((s) => s.trim()).filter(Boolean);
    const chosen = segs.filter((s) => /[A-Za-z]/.test(s)).pop() ?? segs[segs.length - 1];
    if (chosen) return getMainArtist(chosen);
  }

  // 日本語 / English のような混在（全角スラッシュ含む）
  const parts = raw
    .split(/\s*[\/／]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const latin = parts.find((p) => /[A-Za-z]/.test(p));
    const chosen = latin ?? parts[1] ?? parts[0];
    return getMainArtist(chosen);
  }

  // スラッシュ無しで「日本語名 + English名」のように混在しているケースに対応。
  // 例: "ビリー・ジョエル Billy Joel" → "Billy Joel"
  const hasLatin = /[A-Za-z]/.test(raw);
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(raw);

  // 例: "YOUR SONG - Elton John - 1970【和訳】..." のように
  // 「タイトル - アーティスト - 年」フォーマットが artist_name に混ざるケース対策。
  const dashRe = /[-\u2013\u2014\u2015]/;
  if (hasLatin && hasJapanese && dashRe.test(raw)) {
    const partsByDash = raw
      .split(/\s*[-\u2013\u2014\u2015]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);

    // "A - B" 形式でも、右側に英字が含まれていれば右側を候補にする。
    // 例: "777mylene - ... Bette Midler" のようなケース。
    if (partsByDash.length >= 2) {
      const candidates = partsByDash.filter((p) => /[A-Za-z]/.test(p));
      if (candidates.length > 0) {
        const yearRe = /\b(19\d{2}|20\d{2})\b/;
        const chosen =
          candidates.find((p) => !yearRe.test(p) && !/和訳/i.test(p)) ?? candidates[candidates.length - 1];
        if (chosen) return getMainArtist(chosen);
      }
    }

    if (partsByDash.length >= 3) {
      const yearRe = /\b(19\d{2}|20\d{2})\b/;
      const middle = partsByDash[1];
      if (middle && /[A-Za-z]/.test(middle) && !yearRe.test(middle)) {
        return getMainArtist(middle);
      }

      // 最低限「年っぽい塊」を避けて、英字が入ってる中央候補を探す
      const letterParts = partsByDash.filter((p) => /[A-Za-z]/.test(p));
      const chosen =
        letterParts.find((p) => !yearRe.test(p) && !/和訳/i.test(p)) ??
        letterParts.find((p) => !yearRe.test(p));
      if (chosen) return getMainArtist(chosen);
    }
  }

  // 「ビリー・ジョエル Billy Joel」みたいにダッシュ区切りではない混在を抽出。
  if (hasLatin && hasJapanese && !dashRe.test(raw)) {
    const latinMatches = raw.match(/[A-Za-z][A-Za-z0-9'&.\-]*/g);
    if (latinMatches && latinMatches.length > 0) {
      return getMainArtist(latinMatches.join(' '));
    }
  }

  return getMainArtist(raw);
}

/**
 * 一覧の「アーティスト - タイトル」と Music8 タブ用の共通解決。
 * 有名PVは videoId で固定（POST 前に保存された誤 title が残っていても表示を直す）。
 */
function resolvedPlaybackArtistSong(row: RoomPlaybackHistoryRow): {
  artistDisplay: string;
  song: string;
  tabArtist: string;
} | null {
  const famous = resolveFamousPvArtistSongPack(row.video_id);
  if (famous) {
    return {
      artistDisplay: famous.artistDisplay,
      song: famous.song,
      tabArtist: normalizeArtistNameForMusic8Lookup(famous.artist),
    };
  }
  const t = row.title?.trim();
  if (!t) return null;
  /** DB の artist_name は POST 時に概要欄等で取れたアーティスト。無いと逆順タイトルのスワップ判定が弱い */
  const r = getArtistAndSong(t, row.artist_name ?? null);
  if (!r.artistDisplay || !r.song) return null;
  const artistRaw = (r.artist ?? r.artistDisplay).trim();
  const looksLikeSongPhrase =
    r.artistDisplay.includes(',') &&
    /\band\b/i.test(artistRaw) &&
    /\b(it|you|me|my|your|our|the|a|an)\b/i.test(artistRaw.toLowerCase());
  const artistForView = looksLikeSongPhrase ? artistRaw : r.artistDisplay;
  return {
    artistDisplay: artistForView,
    song: r.song,
    tabArtist: normalizeArtistNameForMusic8Lookup(r.artist ?? r.artistDisplay),
  };
}

/**
 * DB の title は過去に誤って「曲名 - アーティスト」で保存された行がある。
 * artist_name を formatArtistTitle に渡すと「チャンネル扱い」になり誤順が固定されるため、
 * 保存文字列だけを getArtistAndSong(..., null) で再解決する（＋有名PVは videoId 優先）。
 */
function artistTitle(row: RoomPlaybackHistoryRow): string {
  const x = resolvedPlaybackArtistSong(row);
  if (x) return `${x.artistDisplay} - ${x.song}`;
  if (!row.title) return row.video_id;
  return row.title;
}

interface RoomPlaybackHistoryProps {
  roomId: string | undefined;
  currentVideoId: string | null;
  /** 変更されると再取得する（ルーム側で10秒後にPOSTしたあと更新用） */
  refreshKey?: number;
  /** ゲストでないときのみお気に入り利用可 */
  isGuest?: boolean;
  /** 自分がお気に入り登録した video_id の一覧（この曲の行はハート点灯） */
  favoritedVideoIds?: string[];
  /** ハートクリック時。ゲストのときは呼ばれず代わりに onGuestFavoriteClick */
  onFavoriteClick?: (row: RoomPlaybackHistoryRow, isFavorited: boolean) => void;
  /** ゲストがハートを押したとき（登録促しメッセージ用） */
  onGuestFavoriteClick?: () => void;
}

export default function RoomPlaybackHistory({
  roomId,
  currentVideoId,
  refreshKey,
  isGuest = true,
  favoritedVideoIds = [],
  onFavoriteClick,
  onGuestFavoriteClick,
}: RoomPlaybackHistoryProps) {
  const [items, setItems] = useState<RoomPlaybackHistoryRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('played_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [loading, setLoading] = useState(false);
  const [guestMessage, setGuestMessage] = useState(false);
  const [styleEditRow, setStyleEditRow] = useState<RoomPlaybackHistoryRow | null>(null);
  const [styleEditValue, setStyleEditValue] = useState('');
  const [styleSaving, setStyleSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'artist' | 'songdata'>('history');
  const [hasMainArtistData, setHasMainArtistData] = useState(false);
  const [hasSongData, setHasSongData] = useState(false);
  /** STYLE_ADMIN_USER_IDS 未設定なら true。設定時は管理者ログイン時のみ true */
  const [canEditStyles, setCanEditStyles] = useState(true);
  const [styleDistOpen, setStyleDistOpen] = useState(false);
  const [eraDistOpen, setEraDistOpen] = useState(false);

  const currentRowForTabs = currentVideoId ? items.find((r) => r.video_id === currentVideoId) : undefined;

  /** メインアーティスト／ソングデータタブ用。DB の artist_name / title が誤っていても再解決する */
  const playbackTabsResolve = useMemo(() => {
    if (!currentRowForTabs) return null;
    const resolved = resolvedPlaybackArtistSong(currentRowForTabs);
    if (resolved) {
      return { tabArtist: resolved.tabArtist, tabSong: resolved.song };
    }
    const t = currentRowForTabs.title?.trim();
    if (!t) return null;
    const r = getArtistAndSong(t, null);
    if (r.artistDisplay && r.song) {
      return {
        tabArtist: normalizeArtistNameForMusic8Lookup(r.artist ?? r.artistDisplay),
        tabSong: r.song,
      };
    }
    const fallbackArtist = currentRowForTabs.artist_name?.trim();
    if (!fallbackArtist) return null;
    return {
      tabArtist: normalizeArtistNameForMusic8Lookup(fallbackArtist),
      tabSong: t,
    };
  }, [currentRowForTabs?.video_id, currentRowForTabs?.title, currentRowForTabs?.artist_name]);

  useEffect(() => {
    fetch('/api/style-admin-check', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.canEdit === 'boolean') setCanEditStyles(d.canEdit);
      })
      .catch(() => setCanEditStyles(true));
  }, []);

  useEffect(() => {
    if (!playbackTabsResolve?.tabArtist?.trim()) {
      setHasMainArtistData(false);
      setHasSongData(false);
      setActiveTab((t) => (t !== 'history' ? 'history' : t));
      return;
    }

    // タブは「Music8 の JSON が取得できたときだけ」表示する。
    setHasMainArtistData(false);
    setHasSongData(false);

    const artistName = playbackTabsResolve.tabArtist;
    const songTitle = playbackTabsResolve.tabSong;
    let cancelled = false;
    let artistOk = false;
    const controller = new AbortController();

    (async () => {
      // 1) メインアーティストJSONの存在チェック
      try {
        const url = getMusic8ArtistJsonUrl(artistName);
        if (!url) throw new Error('no_music8_url');
        const res = await fetch(url, { signal: controller.signal });
        artistOk = res.ok;
        if (!cancelled) setHasMainArtistData(artistOk);
      } catch {
        artistOk = false;
        if (!cancelled) setHasMainArtistData(false);
      }

      // 2) ソングデータ（曲JSON）の存在チェック
      try {
        const d = await fetchMusic8SongDataForPlaybackRow(artistName, songTitle);
        if (cancelled) return;
        const songOk = !!d;
        setHasSongData(songOk);
        setActiveTab((t) => {
          if (t === 'songdata' && !songOk) return artistOk ? 'artist' : 'history';
          if (t === 'artist' && !artistOk) return 'history';
          return t;
        });
      } catch {
        if (cancelled) return;
        setHasSongData(false);
        setActiveTab((t) => {
          if (t === 'songdata') return artistOk ? 'artist' : 'history';
          if (t === 'artist' && !artistOk) return 'history';
          return t;
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentRowForTabs?.video_id, playbackTabsResolve]);

  const handleHeartClick = useCallback(
    (row: RoomPlaybackHistoryRow) => {
      if (isGuest) {
        onGuestFavoriteClick?.();
        setGuestMessage(true);
        setTimeout(() => setGuestMessage(false), 3000);
        return;
      }
      const isFavorited = favoritedVideoIds.includes(row.video_id);
      onFavoriteClick?.(row, isFavorited);
    },
    [isGuest, favoritedVideoIds, onFavoriteClick, onGuestFavoriteClick]
  );

  const fetchItems = useCallback(async () => {
    if (!roomId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const sinceIso = getOrCreatePlaybackSessionSinceIso(roomId);
      const qs = new URLSearchParams({
        roomId,
        since: sinceIso,
      });
      const res = await fetch(`/api/room-playback-history?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      const raw = Array.isArray(data?.items) ? data.items : [];
      setItems(
        raw.map((r: RoomPlaybackHistoryRow) => ({
          ...r,
          era: r.era ?? null,
        })),
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, refreshKey]);

  const sorted = [...items].sort((a, b) => {
    if (sortKey === 'played_at') {
      if (sortOrder === 'desc' && currentVideoId) {
        const aCur = a.video_id === currentVideoId ? 1 : 0;
        const bCur = b.video_id === currentVideoId ? 1 : 0;
        if (aCur !== bCur) return bCur - aCur;
      }
      const tA = new Date(a.played_at).getTime();
      const tB = new Date(b.played_at).getTime();
      return sortOrder === 'desc' ? tB - tA : tA - tB;
    }
    const nameA = (a.display_name ?? '').localeCompare(b.display_name ?? '');
    return sortOrder === 'desc' ? -nameA : nameA;
  });

  const currentRow = currentVideoId ? sorted.find((r) => r.video_id === currentVideoId) : undefined;

  const toggleSort = useCallback(() => {
    setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
  }, []);

  const setSortByTime = useCallback(() => {
    setSortKey('played_at');
    setSortOrder('desc');
  }, []);

  const setSortByParticipant = useCallback(() => {
    setSortKey('display_name');
    setSortOrder('asc');
  }, []);

  const openStyleModal = useCallback((row: RoomPlaybackHistoryRow) => {
    setStyleEditRow(row);
    setStyleEditValue(row.style ?? 'Other');
  }, []);

  const closeStyleModal = useCallback(() => {
    setStyleEditRow(null);
    setStyleSaving(false);
  }, []);

  const saveStyle = useCallback(async () => {
    if (!styleEditRow || !SONG_STYLE_OPTIONS.includes(styleEditValue as (typeof SONG_STYLE_OPTIONS)[number])) return;
    const rowToSave = styleEditRow;
    const valueToSave = styleEditValue;
    setStyleSaving(true);
    try {
      const res = await fetch('/api/room-playback-history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: rowToSave.id,
          videoId: rowToSave.video_id,
          style: valueToSave,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string })?.error ?? '保存に失敗しました';
        setStyleEditRow(null);
        setStyleSaving(false);
        alert(msg);
        return;
      }
      setItems((prev) =>
        prev.map((r) =>
          r.id === rowToSave.id ? { ...r, style: valueToSave } : r
        )
      );
      setStyleEditRow(null);
      setStyleSaving(false);
      // 確実にモーダルを閉じるため、次のティックでも閉じる
      setTimeout(() => setStyleEditRow(null), 0);
    } catch {
      setStyleEditRow(null);
      setStyleSaving(false);
      alert('保存に失敗しました');
    } finally {
      setStyleSaving(false);
    }
  }, [styleEditRow, styleEditValue]);

  if (!roomId) return null;

  const watchInNewTabUrl =
    currentVideoId != null && currentVideoId.trim() !== ''
      ? `https://www.youtube.com/watch?v=${currentVideoId}`
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900/50">
      <div className="flex items-center justify-between gap-2 border-b border-gray-700 px-2 py-1.5 text-sm font-medium text-gray-300">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded px-2 py-1 text-sm transition ${activeTab === 'history' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'}`}
          >
            視聴履歴
          </button>
          {hasMainArtistData && (
            <button
              type="button"
              onClick={() => setActiveTab('artist')}
              className={`rounded px-2 py-1 text-sm transition ${activeTab === 'artist' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'}`}
            >
              メインアーティスト
            </button>
          )}
          {hasSongData && (
            <button
              type="button"
              onClick={() => setActiveTab('songdata')}
              className={`rounded px-2 py-1 text-sm transition ${activeTab === 'songdata' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'}`}
            >
              ソングデータ
            </button>
          )}
          <button
            type="button"
            onClick={() => setEraDistOpen(true)}
            className="ml-1 flex items-center gap-1 border-l border-gray-600 pl-2 text-sm text-gray-400 transition hover:text-gray-200"
            title="年代を表示"
            aria-label="年代を表示"
          >
            <CalendarDaysIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="hidden rounded px-2 py-1 hover:bg-gray-700/50 sm:inline">年代</span>
          </button>
          <button
            type="button"
            onClick={() => setStyleDistOpen(true)}
            className="flex items-center gap-1 text-sm text-gray-400 transition hover:text-gray-200"
            title="スタイルを表示"
            aria-label="スタイルを表示"
          >
            <ChartBarIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span className="hidden rounded px-2 py-1 hover:bg-gray-700/50 sm:inline">スタイル</span>
          </button>
        </div>
        {watchInNewTabUrl && (
          <a
            href={watchInNewTabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-shrink-0 items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white shadow hover:bg-red-500"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            別タブで視聴
          </a>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'artist' && playbackTabsResolve?.tabArtist ? (
          <MainArtistTabPanel
            artistName={playbackTabsResolve.tabArtist}
            songTitle={playbackTabsResolve.tabSong}
          />
        ) : activeTab === 'songdata' && playbackTabsResolve?.tabArtist ? (
          <SongDataTabPanel
            artistName={playbackTabsResolve.tabArtist}
            songTitle={playbackTabsResolve.tabSong}
          />
        ) : (
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-gray-800">
            <tr>
              <th
                className="cursor-pointer border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_PARTICIPANT, minWidth: COL_WIDTH_PARTICIPANT, maxWidth: COL_WIDTH_PARTICIPANT }}
                scope="col"
                title="参加者名でソート"
                onClick={setSortByParticipant}
              >
                <span className="block truncate">{COL_PARTICIPANT}</span>
              </th>
              <th
                className="cursor-pointer border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_TIME, minWidth: COL_WIDTH_TIME, maxWidth: COL_WIDTH_TIME }}
                scope="col"
                title="時間でソート"
                onClick={setSortByTime}
              >
                <span className="block truncate">{COL_TIME}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_ERA, minWidth: COL_WIDTH_ERA, maxWidth: COL_WIDTH_ERA }}
                scope="col"
                title="録音・ヒットの十年（Music8 / AI）"
              >
                <span className="block truncate">{COL_ERA}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_STYLE, minWidth: COL_WIDTH_STYLE, maxWidth: COL_WIDTH_STYLE }}
                scope="col"
                title="曲のスタイル"
              >
                <span className="block truncate">{COL_STYLE}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ minWidth: COL_MIN_WIDTH_ARTIST_TITLE }}
                scope="col"
              >
                <span className="block truncate">{COL_ARTIST_TITLE}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_LINK, minWidth: COL_WIDTH_LINK, maxWidth: COL_WIDTH_LINK }}
                scope="col"
              >
                <span className="block truncate">{COL_LINK}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pr-1 font-medium text-gray-400"
                style={{ width: COL_WIDTH_FAV, minWidth: COL_WIDTH_FAV, maxWidth: COL_WIDTH_FAV }}
                scope="col"
                title="お気に入り"
              >
                <span className="block truncate">{COL_FAV}</span>
              </th>
              <th
                className="border-b border-gray-600 py-1 pl-0 pr-1 text-right"
                style={{ width: 28, minWidth: 28, maxWidth: 28 }}
                scope="col"
              >
                <button
                  type="button"
                  onClick={toggleSort}
                  className="rounded px-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                  title={sortOrder === 'desc' ? '昇順に切り替え' : '降順に切り替え'}
                  aria-label={sortOrder === 'desc' ? '昇順' : '降順'}
                >
                  {sortOrder === 'desc' ? '▼' : '▲'}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-2 text-center text-gray-500">
                  読み込み中...
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-2 text-center text-gray-500">
                  履歴がありません
                </td>
              </tr>
            ) : (
              (() => {
                const renderRow = (row: RoomPlaybackHistoryRow) => {
                  const isActive = currentVideoId !== null && row.video_id === currentVideoId;
                  const isFavorited = favoritedVideoIds.includes(row.video_id);
                  const url = `https://www.youtube.com/watch?v=${row.video_id}`;
                  return (
                    <tr key={row.id} className={isActive ? 'bg-blue-900/30' : ''}>
                      <td
                        className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-200"
                        style={{
                          width: COL_WIDTH_PARTICIPANT,
                          minWidth: COL_WIDTH_PARTICIPANT,
                          maxWidth: COL_WIDTH_PARTICIPANT,
                        }}
                        title={row.display_name}
                      >
                        {row.display_name}
                      </td>
                      <td
                        className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400"
                        style={{ width: COL_WIDTH_TIME, minWidth: COL_WIDTH_TIME, maxWidth: COL_WIDTH_TIME }}
                      >
                        {formatPlayedAt(row.played_at)}
                      </td>
                      <td
                        className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400"
                        style={{
                          width: COL_WIDTH_ERA,
                          minWidth: COL_WIDTH_ERA,
                          maxWidth: COL_WIDTH_ERA,
                          color: getEraTextColor(row.era),
                        }}
                        title={row.era ? `年代: ${row.era}` : '年代未設定（新規再生で付与）'}
                      >
                        {row.era?.trim() ? row.era : '—'}
                      </td>
                      <td
                        className={
                          canEditStyles
                            ? 'cursor-pointer truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400 hover:bg-gray-700/50 hover:text-white hover:underline'
                            : 'truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-400'
                        }
                        style={{
                          width: COL_WIDTH_STYLE,
                          minWidth: COL_WIDTH_STYLE,
                          maxWidth: COL_WIDTH_STYLE,
                          color: getStyleTextColor(row.style),
                        }}
                        title={
                          canEditStyles
                            ? row.style
                              ? `${row.style}（クリックで変更）`
                              : 'クリックでスタイルを設定'
                            : row.style ?? undefined
                        }
                        onClick={canEditStyles ? () => openStyleModal(row) : undefined}
                        role={canEditStyles ? 'button' : undefined}
                        tabIndex={canEditStyles ? 0 : undefined}
                        onKeyDown={
                          canEditStyles
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openStyleModal(row);
                                }
                              }
                            : undefined
                        }
                      >
                        {row.style ?? '—'}
                      </td>
                      <td
                        className="truncate border-b border-gray-700/80 py-0.5 pr-1 text-gray-200"
                        style={{ minWidth: COL_MIN_WIDTH_ARTIST_TITLE }}
                        title={artistTitle(row)}
                      >
                        {artistTitle(row)}
                      </td>
                      <td
                        className="border-b border-gray-700/80 py-0.5 pr-1"
                        style={{ width: COL_WIDTH_LINK, minWidth: COL_WIDTH_LINK, maxWidth: COL_WIDTH_LINK }}
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-red-400 hover:underline"
                          title="YouTubeで開く"
                        >
                          YT
                        </a>
                      </td>
                      <td
                        className="border-b border-gray-700/80 py-0.5 pr-1"
                        style={{ width: COL_WIDTH_FAV, minWidth: COL_WIDTH_FAV, maxWidth: COL_WIDTH_FAV }}
                      >
                        <button
                          type="button"
                          onClick={() => handleHeartClick(row)}
                          className="rounded p-0.5 text-lg leading-none transition hover:scale-110"
                          title={
                            isGuest
                              ? 'お気に入り（登録で利用可）'
                              : isFavorited
                                ? 'お気に入り解除'
                                : 'お気に入りに追加'
                          }
                          aria-label={isFavorited ? 'お気に入り解除' : 'お気に入りに追加'}
                        >
                          {isFavorited ? (
                            <span className="text-red-500" aria-hidden>
                              ♥
                            </span>
                          ) : (
                            <span className="text-gray-500 hover:text-red-400" aria-hidden>
                              ♡
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="border-b border-gray-700/80 py-0.5 pl-0 pr-1" style={{ width: 28, minWidth: 28, maxWidth: 28 }} />
                    </tr>
                  );
                };

                if (sortKey !== 'played_at') {
                  return sorted.map(renderRow);
                }

                const nodes: JSX.Element[] = [];
                let lastDateKey: string | null = null;
                for (const row of sorted) {
                  const played = formatPlayedDateWithWeekday(row.played_at);
                  if (played && played.key !== lastDateKey) {
                    nodes.push(
                      <tr key={`sep-${played.key}`} className="bg-gray-800/25">
                        <td colSpan={8} className="border-b border-gray-700/80 px-2 py-1.5 text-xs font-semibold text-gray-200">
                          {played.label}
                        </td>
                      </tr>
                    );
                    lastDateKey = played.key;
                  }
                  nodes.push(renderRow(row));
                }
                return nodes;
              })()
            )}
          </tbody>
        </table>
        )}
      </div>
      {guestMessage && (
        <p className="border-t border-gray-700 bg-amber-900/20 px-2 py-1.5 text-center text-xs text-amber-200">
          ユーザー登録で利用できます
        </p>
      )}

      <StyleDistributionModal
        roomId={roomId}
        open={styleDistOpen}
        onClose={() => setStyleDistOpen(false)}
      />

      <EraDistributionModal
        roomId={roomId}
        open={eraDistOpen}
        onClose={() => setEraDistOpen(false)}
      />

      {styleEditRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="style-modal-title"
          onClick={closeStyleModal}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="style-modal-title" className="mb-2 text-sm font-medium text-gray-200">
              スタイルを変更
            </h2>
            <p className="mb-3 truncate text-xs text-gray-400" title={artistTitle(styleEditRow)}>
              {artistTitle(styleEditRow)}
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-gray-400">スタイル</span>
              <select
                value={styleEditValue}
                onChange={(e) => setStyleEditValue(e.target.value)}
                className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              >
                {SONG_STYLE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeStyleModal}
                className="rounded px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveStyle}
                disabled={styleSaving}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {styleSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

