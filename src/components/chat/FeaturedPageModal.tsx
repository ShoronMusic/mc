'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryArtistAutoplayRequest } from '@/lib/library-artist-autoplay';
import {
  librarySongListSortOrderLabel,
  type LibrarySongListSortKey,
} from '@/lib/library-artist-autoplay';
import { compareLibraryReleaseSort } from '@/lib/library-release-sort-date';
import { formatFeaturedArtistDisplayLabel } from '@/lib/featured-pages';
import { LibraryArtistAutoplayConfirmModal } from '@/components/chat/LibraryArtistAutoplayConfirmModal';
import {
  librarySelectSongBtnClass,
  librarySortChipBtnClass,
} from '@/lib/product-branding';

type FeaturedListItem = {
  id: string;
  title: string;
  slug: string;
  ai_usage_free: boolean;
};

type FeaturedGroup = {
  style: string;
  artists: Array<{
    id: string;
    artist_name: string;
    style: string;
    label_note?: string | null;
    sort_order: number;
  }>;
};

type FeaturedDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  ai_usage_free: boolean;
  groups: FeaturedGroup[];
};

type FeaturedSongItem = {
  videoId: string;
  title: string;
  artist: string;
  displayMeta?: string;
  original_release_date: string | null;
  youtube_published_at: string | null;
  spotify_popularity: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** 一覧から特定ページを開く（省略時は一覧→詳細） */
  initialPageId?: string | null;
  onLibraryArtistAutoplay: (params: LibraryArtistAutoplayRequest) => void | Promise<void>;
  isGuest?: boolean;
  participatesInSelection?: boolean;
  roomInteractionLocked?: boolean;
};

const SORT_OPTIONS: Array<{ key: LibrarySongListSortKey; label: string }> = [
  { key: 'release_new', label: 'NEW' },
  { key: 'release_old', label: 'OLD' },
  { key: 'popularity', label: '人気順' },
  { key: 'title_asc', label: 'A-Z' },
];

function formatReleaseMeta(row: FeaturedSongItem): string | undefined {
  const d = (row.original_release_date || row.youtube_published_at || '').trim();
  if (!d) return undefined;
  return d.slice(0, 7);
}

function sortFeaturedSongs(
  rows: FeaturedSongItem[],
  sort: LibrarySongListSortKey,
): FeaturedSongItem[] {
  const next = [...rows];
  next.sort((a, b) => {
    if (sort === 'title_asc') {
      return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    }
    if (sort === 'popularity') {
      const pa = a.spotify_popularity ?? -1;
      const pb = b.spotify_popularity ?? -1;
      if (pb !== pa) return pb - pa;
    } else {
      const order = sort === 'release_new' ? 'desc' : 'asc';
      const c = compareLibraryReleaseSort(
        {
          originalReleaseDate: a.original_release_date,
          youtubePublishedAt: a.youtube_published_at,
        },
        {
          originalReleaseDate: b.original_release_date,
          youtubePublishedAt: b.youtube_published_at,
        },
        order,
      );
      if (c !== 0) return c;
    }
    return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
  });
  return next;
}

export function FeaturedPageModal({
  open,
  onClose,
  initialPageId = null,
  onLibraryArtistAutoplay,
  isGuest = false,
  participatesInSelection = true,
  roomInteractionLocked = false,
}: Props) {
  const [list, setList] = useState<FeaturedListItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detail, setDetail] = useState<FeaturedDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedLabelNote, setSelectedLabelNote] = useState<string | null>(null);
  const [songRowsRaw, setSongRowsRaw] = useState<FeaturedSongItem[]>([]);
  const [songListSort, setSongListSort] = useState<LibrarySongListSortKey>('release_new');
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStartVideoId, setConfirmStartVideoId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/featured-pages');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(typeof data.error === 'string' ? data.error : '特集の取得に失敗しました。');
        setList([]);
        return;
      }
      setList(Array.isArray(data.items) ? data.items : []);
    } catch {
      setListError('特集の取得に失敗しました。');
      setList([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (pageId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/featured-pages?id=${encodeURIComponent(pageId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) {
        setDetailError(typeof data.error === 'string' ? data.error : '特集の取得に失敗しました。');
        setDetail(null);
        return;
      }
      setDetail(data.item as FeaturedDetail);
    } catch {
      setDetailError('特集の取得に失敗しました。');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const resetArtistSongs = useCallback(() => {
    setSelectedArtist(null);
    setSelectedLabelNote(null);
    setSongRowsRaw([]);
    setSongListSort('release_new');
    setSongsError(null);
    setConfirmOpen(false);
    setConfirmStartVideoId(null);
  }, []);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      resetArtistSongs();
      return;
    }
    void loadList().then(() => {
      if (initialPageId) void loadDetail(initialPageId);
    });
  }, [open, initialPageId, loadList, loadDetail, resetArtistSongs]);

  const loadSongsForArtist = useCallback(async (artistName: string) => {
    setSongsLoading(true);
    setSongsError(null);
    try {
      const res = await fetch(
        `/api/library/songs-by-artist?artist=${encodeURIComponent(artistName)}&sort=release`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSongsError(typeof data.error === 'string' ? data.error : '曲一覧の取得に失敗しました。');
        setSongRowsRaw([]);
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      const rows: FeaturedSongItem[] = [];
      const seen = new Set<string>();
      for (const row of items) {
        const videoId = typeof row.video_id === 'string' ? row.video_id.trim() : '';
        if (!videoId || seen.has(videoId)) continue;
        seen.add(videoId);
        const title =
          (typeof row.song_title === 'string' && row.song_title.trim()) ||
          (typeof row.display_title === 'string' && row.display_title.trim()) ||
          videoId;
        const artist =
          (typeof row.main_artist === 'string' && row.main_artist.trim()) || artistName;
        const item: FeaturedSongItem = {
          videoId,
          title,
          artist,
          original_release_date:
            typeof row.original_release_date === 'string' ? row.original_release_date : null,
          youtube_published_at:
            typeof row.youtube_published_at === 'string' ? row.youtube_published_at : null,
          spotify_popularity:
            typeof row.spotify_popularity === 'number' ? row.spotify_popularity : null,
        };
        item.displayMeta = formatReleaseMeta(item);
        rows.push(item);
      }
      setSongRowsRaw(rows);
      if (rows.length === 0) {
        setSongsError('再生できる動画がある曲がライブラリにありません。');
      }
    } catch {
      setSongsError('曲一覧の取得に失敗しました。');
      setSongRowsRaw([]);
    } finally {
      setSongsLoading(false);
    }
  }, []);

  const openArtistSongs = useCallback(
    (artistName: string, labelNote?: string | null) => {
      if (isGuest || !participatesInSelection || roomInteractionLocked) return;
      setSelectedArtist(artistName);
      setSelectedLabelNote(typeof labelNote === 'string' ? labelNote.trim() || null : null);
      setSongListSort('release_new');
      setConfirmOpen(false);
      setConfirmStartVideoId(null);
      void loadSongsForArtist(artistName);
    },
    [isGuest, participatesInSelection, roomInteractionLocked, loadSongsForArtist],
  );

  const sortedSongs = useMemo(
    () => sortFeaturedSongs(songRowsRaw, songListSort),
    [songRowsRaw, songListSort],
  );

  const autoplaySongs = useMemo(
    () =>
      sortedSongs.map((s) => ({
        videoId: s.videoId,
        title: s.title,
        artist: s.artist,
        displayMeta: s.displayMeta,
      })),
    [sortedSongs],
  );

  const openConfirm = useCallback((startVideoId?: string | null) => {
    setConfirmStartVideoId(startVideoId ?? null);
    setConfirmOpen(true);
  }, []);

  const submitAutoplay = useCallback(() => {
    if (!selectedArtist || !detail || autoplaySongs.length === 0) return;
    void onLibraryArtistAutoplay({
      artistName: selectedArtist,
      songs: autoplaySongs,
      orderLabel: librarySongListSortOrderLabel(songListSort),
      startVideoId: confirmStartVideoId,
      featuredPageId: detail.id,
      featuredAiUsageFree: detail.ai_usage_free,
      featuredPageTitle: detail.title,
    });
    setConfirmOpen(false);
    onClose();
  }, [
    selectedArtist,
    detail,
    autoplaySongs,
    songListSort,
    confirmStartVideoId,
    onLibraryArtistAutoplay,
    onClose,
  ]);

  const showList = open && !detail;
  const pageTitle = detail?.title ?? '特集';
  const inArtistSongs = Boolean(selectedArtist);

  const disabledReason = useMemo(() => {
    if (isGuest) return 'ログインユーザーのみ利用できます';
    if (!participatesInSelection) return '選曲に参加していないため利用できません';
    if (roomInteractionLocked) return '操作できません';
    return null;
  }, [isGuest, participatesInSelection, roomInteractionLocked]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={pageTitle}
      onClick={onClose}
    >
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-lg border border-amber-700/50 bg-gray-950 shadow-xl ${
          inArtistSongs
            ? 'h-[min(88vh,760px)] max-w-3xl'
            : 'max-h-[90vh] max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {confirmOpen && selectedArtist ? (
          <div className="relative min-h-0 flex-1">
            <LibraryArtistAutoplayConfirmModal
              artistName={selectedArtist}
              songs={autoplaySongs}
              sort={songListSort}
              startVideoId={confirmStartVideoId}
              onSortChange={(sort) => {
                setSongListSort(sort);
                setConfirmStartVideoId(null);
              }}
              onStartVideoIdChange={setConfirmStartVideoId}
              onCancel={() => {
                setConfirmOpen(false);
                setConfirmStartVideoId(null);
              }}
              onConfirm={submitAutoplay}
            />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-800/50 bg-amber-950/40 px-3 py-2">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-amber-50">
                  {inArtistSongs
                    ? formatFeaturedArtistDisplayLabel(selectedArtist ?? '', selectedLabelNote)
                    : pageTitle}
                </h2>
                {detail?.ai_usage_free && !inArtistSongs ? (
                  <p className="text-[11px] text-emerald-300">この特集からの選曲は AI 使用量無料</p>
                ) : null}
                {inArtistSongs ? (
                  <p className="truncate text-[11px] text-gray-400">{pageTitle}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                {inArtistSongs ? (
                  <button
                    type="button"
                    className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                    onClick={resetArtistSongs}
                  >
                    アーティスト一覧
                  </button>
                ) : detail && list.length > 1 ? (
                  <button
                    type="button"
                    className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                    onClick={() => {
                      setDetail(null);
                      resetArtistSongs();
                    }}
                  >
                    一覧
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                  onClick={onClose}
                >
                  閉じる
                </button>
              </div>
            </header>

            {inArtistSongs ? (
              <>
                <div className="shrink-0 border-b border-lime-900/60 px-3 py-2 sm:px-4">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label="曲一覧の並び順"
                  >
                    <span className="mr-1 text-[11px] text-gray-500">並び順</span>
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setSongListSort(option.key)}
                        aria-pressed={songListSort === option.key}
                        className={librarySortChipBtnClass(songListSort === option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    ライブラリと同じ並びです。曲を選んでから全曲選曲するか、下のボタンで先頭からセットできます。
                  </p>
                </div>

                <div className="mc-scrollbar-stable min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-4">
                  {songsLoading ? (
                    <p className="py-6 text-sm text-gray-400">曲一覧を読み込み中…</p>
                  ) : songsError ? (
                    <p className="py-4 text-sm text-red-300">{songsError}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {sortedSongs.map((song, index) => (
                        <li key={song.videoId}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded border border-gray-800 bg-gray-950/70 px-3 py-2 text-left hover:border-violet-700/80"
                            onClick={() => openConfirm(song.videoId)}
                            title="この曲から全曲選曲の確認へ"
                          >
                            <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-gray-600">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-gray-200">
                                {song.title}
                              </span>
                              <span className="block truncate text-[10px] text-gray-500">
                                {[song.displayMeta, song.artist].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <footer className="shrink-0 border-t border-lime-900/70 px-3 py-3 sm:px-4">
                  <p className="mb-2 text-[11px] text-gray-400">
                    {sortedSongs.length}曲（一般ユーザーは最大40曲）
                    {detail?.ai_usage_free ? (
                      <span className="ml-2 text-emerald-300">AI無料</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    disabled={sortedSongs.length === 0 || songsLoading || Boolean(disabledReason)}
                    onClick={() => openConfirm(null)}
                    className={librarySelectSongBtnClass('w-full')}
                  >
                    全曲選曲（{sortedSongs.length}）
                  </button>
                </footer>
              </>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {disabledReason ? (
                  <p className="mb-2 text-xs text-amber-200/90">{disabledReason}</p>
                ) : null}

                {showList ? (
                  listLoading ? (
                    <p className="text-sm text-gray-400">読み込み中…</p>
                  ) : listError ? (
                    <p className="text-sm text-red-300">{listError}</p>
                  ) : list.length === 0 ? (
                    <p className="text-sm text-gray-500">公開中の特集はありません。</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full rounded border border-gray-700 bg-gray-900/60 px-3 py-2 text-left hover:border-amber-600/50 hover:bg-amber-950/20"
                            onClick={() => void loadDetail(p.id)}
                          >
                            <span className="font-medium text-white">{p.title}</span>
                            {p.ai_usage_free ? (
                              <span className="ml-2 text-[11px] text-emerald-300">AI無料</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : detailLoading ? (
                  <p className="text-sm text-gray-400">読み込み中…</p>
                ) : detailError ? (
                  <p className="text-sm text-red-300">{detailError}</p>
                ) : detail ? (
                  <div className="space-y-4">
                    {detail.description ? (
                      <p className="text-xs text-gray-400">{detail.description}</p>
                    ) : null}
                    {detail.groups.map((g) => (
                      <section key={g.style}>
                        <h3 className="mb-1 border-b border-gray-700 pb-1 text-sm font-semibold text-white">
                          {g.style}
                        </h3>
                        <ul className="space-y-0.5">
                          {g.artists.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                disabled={Boolean(disabledReason)}
                                className="w-full rounded px-2 py-1.5 text-left text-sm text-gray-100 hover:bg-lime-950/40 disabled:opacity-40"
                                onClick={() => openArtistSongs(a.artist_name, a.label_note)}
                              >
                                {formatFeaturedArtistDisplayLabel(a.artist_name, a.label_note)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                    {detail.groups.length === 0 ? (
                      <p className="text-sm text-gray-500">アーティストがまだありません。</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
