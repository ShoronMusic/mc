/**
 * ライブラリ「アーティスト全曲選曲」→ 専用オートプレイキュー用の正規化。
 * Music8 / YouTube PL と同じキュー形状（Music8PlaylistAutoplayState）に載せる。
 */

import {
  createMusic8PlaylistAutoplayState,
  formatMusic8PlaylistStartMessage,
  type Music8PlaylistAutoplaySong,
  type Music8PlaylistAutoplayState,
} from '@/lib/music8-playlist-autoplay';

/** 一般ユーザーの既定上限（Music8 / YouTube PL と同じ）。STYLE_ADMIN は null で無制限。 */
export const LIBRARY_ARTIST_AUTOPLAY_DEFAULT_MAX = 40;

export type LibraryArtistAutoplaySongInput = {
  videoId?: string | null;
  title?: string | null;
  artist?: string | null;
};

export type LibrarySongListSortKey =
  | 'release_new'
  | 'release_old'
  | 'popularity'
  | 'title_asc';

export function librarySongListSortOrderLabel(sort: LibrarySongListSortKey): string {
  switch (sort) {
    case 'release_old':
      return '公開日が古い順';
    case 'popularity':
      return '人気順';
    case 'title_asc':
      return '曲名A-Z順';
    case 'release_new':
    default:
      return '公開日が新しい順';
  }
}

/**
 * videoId 付きのみ・重複除外。`maxSongs === null` は上限なし（STYLE_ADMIN）。
 */
export function prepareLibraryArtistAutoplaySongs(
  rows: LibraryArtistAutoplaySongInput[],
  maxSongs: number | null = LIBRARY_ARTIST_AUTOPLAY_DEFAULT_MAX,
): { songs: Music8PlaylistAutoplaySong[]; totalFetched: number; truncated: boolean } {
  const seen = new Set<string>();
  const all: Music8PlaylistAutoplaySong[] = [];
  for (const row of rows) {
    const videoId = typeof row.videoId === 'string' ? row.videoId.trim() : '';
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const title = (typeof row.title === 'string' && row.title.trim()) || videoId;
    const artist = typeof row.artist === 'string' ? row.artist.trim() : '';
    all.push({ videoId, title, artist });
  }
  const totalFetched = all.length;
  if (maxSongs == null) {
    return { songs: all, totalFetched, truncated: false };
  }
  const capped = Math.max(1, Math.floor(maxSongs));
  const truncated = totalFetched > capped;
  return {
    songs: truncated ? all.slice(0, capped) : all,
    totalFetched,
    truncated,
  };
}

export function libraryArtistAutoplaySlug(artistName: string): string {
  const base = artistName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base ? `library-${base}` : 'library-artist';
}

export function buildLibraryArtistAutoplayLaunch(params: {
  artistName: string;
  songs: LibraryArtistAutoplaySongInput[];
  orderLabel?: string;
  /** `null` = STYLE_ADMIN 向け上限なし */
  maxSongs?: number | null;
}): {
  state: Music8PlaylistAutoplayState;
  startMessage: string;
  truncated: boolean;
  totalFetched: number;
} | null {
  const artistName = params.artistName.trim();
  if (!artistName) return null;

  const maxSongs =
    params.maxSongs === undefined ? LIBRARY_ARTIST_AUTOPLAY_DEFAULT_MAX : params.maxSongs;
  const { songs, totalFetched, truncated } = prepareLibraryArtistAutoplaySongs(
    params.songs,
    maxSongs,
  );
  if (songs.length === 0) return null;

  const orderLabel = params.orderLabel?.trim() || '一覧の並び順';
  const state = createMusic8PlaylistAutoplayState({
    slug: libraryArtistAutoplaySlug(artistName),
    title: artistName,
    sourceLabel: 'ライブラリ',
    orderLabel,
    songs,
  });
  if (!state) return null;

  return {
    state,
    startMessage: formatMusic8PlaylistStartMessage({
      title: state.title,
      songCount: state.songs.length,
      sourceLabel: state.sourceLabel,
      orderLabel: state.orderLabel,
      truncated,
      totalFetched,
    }),
    truncated,
    totalFetched,
  };
}
