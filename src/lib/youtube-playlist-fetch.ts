/**
 * YouTube Data API の playlistItems を、部屋の連続再生用に軽量正規化する。
 */

import { suggestMyListArtistTitleFromYoutubeStyle } from '@/lib/my-list-youtube-title-suggest';
import { parseYoutubePlaylistUrl } from '@/lib/youtube-playlist-url';

const DEFAULT_MAX_SONGS = 40;
const ABSOLUTE_MAX_SONGS = 80;
const FETCH_TIMEOUT_MS = 15_000;
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export type YoutubePlaylistNormalizedSong = {
  videoId: string;
  title: string;
  artist: string;
  rawTitle: string;
  channelTitle: string;
};

export type YoutubePlaylistFetchFailure = {
  ok: false;
  reason: 'invalid_url' | 'not_configured' | 'not_found' | 'upstream_error' | 'empty_songs';
  message: string;
};

export type YoutubePlaylistFetchSuccess = {
  ok: true;
  source: 'youtube';
  playlist: {
    id: string;
    title: string;
    url: string;
  };
  order: 'playlist_order';
  truncated: boolean;
  totalFetched: number;
  songs: YoutubePlaylistNormalizedSong[];
};

export type YoutubePlaylistFetchResult = YoutubePlaylistFetchSuccess | YoutubePlaylistFetchFailure;

type YoutubePlaylistApiItem = {
  snippet?: {
    title?: string;
    channelTitle?: string;
    videoOwnerChannelTitle?: string;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
};

export function getYoutubePlaylistAutoplayMax(): number {
  const raw = process.env.YOUTUBE_PLAYLIST_AUTOPLAY_MAX;
  if (raw == null || String(raw).trim() === '') return DEFAULT_MAX_SONGS;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_SONGS;
  return Math.min(ABSOLUTE_MAX_SONGS, Math.max(1, n));
}

/**
 * `null` = 上限なし（STYLE_ADMIN 向け）。
 * `undefined` = env / 既定（最大 ABSOLUTE_MAX）。
 * 数値 = その件数（ABSOLUTE_MAX でクランプ）。
 */
export function resolveYoutubePlaylistAutoplayMax(
  maxSongs: number | null | undefined,
): number | null {
  if (maxSongs === null) return null;
  if (typeof maxSongs === 'number' && Number.isFinite(maxSongs)) {
    return Math.min(ABSOLUTE_MAX_SONGS, Math.max(1, Math.floor(maxSongs)));
  }
  return getYoutubePlaylistAutoplayMax();
}

function normalizePlaylistTitle(raw: string | undefined, fallback: string): string {
  const title = String(raw ?? '').trim();
  return title && title !== 'Private video' && title !== 'Deleted video' ? title : fallback;
}

export function normalizeYoutubePlaylistItems(
  items: YoutubePlaylistApiItem[] | undefined | null,
  maxSongs: number | null = getYoutubePlaylistAutoplayMax(),
): { songs: YoutubePlaylistNormalizedSong[]; totalFetched: number; truncated: boolean } {
  const cappedMax = resolveYoutubePlaylistAutoplayMax(maxSongs);
  const seen = new Set<string>();
  const songsAll: YoutubePlaylistNormalizedSong[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    const videoId =
      item.contentDetails?.videoId?.trim() || item.snippet?.resourceId?.videoId?.trim() || '';
    if (!YOUTUBE_VIDEO_ID_RE.test(videoId) || seen.has(videoId)) continue;
    const rawTitle = String(item.snippet?.title ?? '').trim();
    if (!rawTitle || rawTitle === 'Private video' || rawTitle === 'Deleted video') continue;
    seen.add(videoId);

    const channelTitle =
      String(item.snippet?.videoOwnerChannelTitle ?? '').trim() ||
      String(item.snippet?.channelTitle ?? '').trim();
    const suggested = suggestMyListArtistTitleFromYoutubeStyle(channelTitle || null, rawTitle);
    songsAll.push({
      videoId,
      title: suggested.title || rawTitle || videoId,
      artist: suggested.artists.filter(Boolean).join(', '),
      rawTitle,
      channelTitle,
    });
  }

  const totalFetched = songsAll.length;
  if (cappedMax == null) {
    return { songs: songsAll, totalFetched, truncated: false };
  }
  const truncated = totalFetched > cappedMax;
  return {
    songs: truncated ? songsAll.slice(0, cappedMax) : songsAll,
    totalFetched,
    truncated,
  };
}

async function fetchPlaylistTitle(playlistId: string, apiKey: string): Promise<string | null> {
  const params = new URLSearchParams({
    part: 'snippet',
    id: playlistId,
    key: apiKey,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => null)) as {
    items?: Array<{ snippet?: { title?: string } }>;
  } | null;
  if (!res.ok) return null;
  return data?.items?.[0]?.snippet?.title?.trim() || null;
}

async function fetchPlaylistItems(
  playlistId: string,
  apiKey: string,
  maxSongs: number | null,
): Promise<{ status: number; items: YoutubePlaylistApiItem[] | null; errorMessage?: string }> {
  const items: YoutubePlaylistApiItem[] = [];
  let nextPageToken: string | null = null;
  // maxSongs == null（STYLE_ADMIN）は全ページ取得。それ以外は上限件数まで。
  while (maxSongs == null || items.length < maxSongs) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: apiKey,
    });
    if (nextPageToken) params.set('pageToken', nextPageToken);

    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      nextPageToken?: string;
      items?: YoutubePlaylistApiItem[];
    } | null;
    if (!res.ok || data?.error) {
      return {
        status: res.status,
        items: null,
        errorMessage: data?.error?.message ?? `YouTube playlistItems HTTP ${res.status}`,
      };
    }
    items.push(...(data?.items ?? []));
    nextPageToken = data?.nextPageToken?.trim() || null;
    if (!nextPageToken) break;
  }
  return { status: 200, items };
}

export async function fetchNormalizedYoutubePlaylist(params: {
  url?: string;
  playlistId?: string;
  /** `null` で曲数上限なし（STYLE_ADMIN） */
  maxSongs?: number | null;
}): Promise<YoutubePlaylistFetchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'YouTube プレイリストを使うには、サーバーに YOUTUBE_API_KEY の設定が必要です。',
    };
  }

  let playlistId = params.playlistId?.trim() ?? '';
  let canonicalUrl = '';
  if (params.url?.trim()) {
    const parsed = parseYoutubePlaylistUrl(params.url.trim());
    if (!parsed) {
      return {
        ok: false,
        reason: 'invalid_url',
        message: 'YouTube プレイリスト URL として認識できませんでした。',
      };
    }
    playlistId = parsed.playlistId;
    canonicalUrl = parsed.canonicalUrl;
  } else if (playlistId) {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(playlistId)) {
      return {
        ok: false,
        reason: 'invalid_url',
        message: 'YouTube プレイリスト ID が不正です。',
      };
    }
    canonicalUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  } else {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'url または playlistId を指定してください。',
    };
  }

  const maxSongs = resolveYoutubePlaylistAutoplayMax(
    params.maxSongs === undefined ? getYoutubePlaylistAutoplayMax() : params.maxSongs,
  );
  const [title, itemResult] = await Promise.all([
    fetchPlaylistTitle(playlistId, apiKey).catch(() => null),
    fetchPlaylistItems(playlistId, apiKey, maxSongs).catch(() => ({
      status: 0,
      items: null,
      errorMessage: 'YouTube プレイリストの取得に失敗しました。',
    })),
  ]);

  if (!itemResult.items) {
    const reason = itemResult.status === 404 ? 'not_found' : 'upstream_error';
    return {
      ok: false,
      reason,
      message:
        reason === 'not_found'
          ? 'YouTube プレイリストが見つかりませんでした。'
          : itemResult.errorMessage ?? 'YouTube プレイリストの取得に失敗しました。',
    };
  }

  const { songs, totalFetched, truncated } = normalizeYoutubePlaylistItems(itemResult.items, maxSongs);
  if (songs.length === 0) {
    return {
      ok: false,
      reason: 'empty_songs',
      message: '再生できる YouTube 動画がプレイリストにありませんでした。',
    };
  }

  return {
    ok: true,
    source: 'youtube',
    playlist: {
      id: playlistId,
      title: normalizePlaylistTitle(title ?? undefined, playlistId),
      url: canonicalUrl,
    },
    order: 'playlist_order',
    truncated,
    totalFetched,
    songs,
  };
}
