/**
 * Music8 WP REST プレイリスト取得と正規化（post_date DESC・上限・重複除外）。
 */

import {
  getMusic8WpRestBaseUrl,
  isLikelyYoutubeVideoId,
  isMusic8WpRestEnabled,
} from '@/lib/music8-wp-rest';
import { parseMusic8PlaylistUrl } from '@/lib/music8-playlist-url';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SONGS = 40;
const ABSOLUTE_MAX_SONGS = 80;

export type Music8PlaylistRawSong = {
  id?: number;
  title?: string;
  yt_video_id?: string;
  first_artist?: string;
  artists?: string[];
  post_date?: string;
};

export type Music8PlaylistRaw = {
  id?: number;
  title?: string;
  description?: string;
  thumbnail?: string;
  songs?: Music8PlaylistRawSong[];
};

export type Music8PlaylistNormalizedSong = {
  videoId: string;
  title: string;
  artist: string;
  music8SongId?: number;
  postDate?: string;
};

export type Music8PlaylistNormalized = {
  playlist: {
    id: number;
    slug: string;
    title: string;
    url: string;
    description: string;
    thumbnail: string;
  };
  order: 'date_desc';
  truncated: boolean;
  totalFetched: number;
  songs: Music8PlaylistNormalizedSong[];
};

export type Music8PlaylistFetchFailure = {
  ok: false;
  reason: 'invalid_url' | 'not_found' | 'upstream_error' | 'empty_songs' | 'disabled';
  message: string;
};

export type Music8PlaylistFetchSuccess = {
  ok: true;
  source: 'music8';
} & Music8PlaylistNormalized;

export type Music8PlaylistFetchResult = Music8PlaylistFetchSuccess | Music8PlaylistFetchFailure;

export function getMusic8PlaylistAutoplayMax(): number {
  const raw = process.env.MUSIC8_PLAYLIST_AUTOPLAY_MAX;
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
export function resolveMusic8PlaylistAutoplayMax(
  maxSongs: number | null | undefined,
): number | null {
  if (maxSongs === null) return null;
  if (typeof maxSongs === 'number' && Number.isFinite(maxSongs)) {
    return Math.min(ABSOLUTE_MAX_SONGS, Math.max(1, Math.floor(maxSongs)));
  }
  return getMusic8PlaylistAutoplayMax();
}

function postDateSortKey(postDate: string | undefined): number {
  if (!postDate || !String(postDate).trim()) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(String(postDate).trim().replace(/ /g, 'T'));
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * 上流 songs を正規化: 空 ID 除外 → post_date DESC → 重複除外 → 上限。
 * `maxSongs === null` のとき上限なし（切り捨てなし）。
 * （単体テスト用に export）
 */
export function normalizeMusic8PlaylistSongs(
  rawSongs: Music8PlaylistRawSong[] | undefined | null,
  maxSongs: number | null = getMusic8PlaylistAutoplayMax(),
): { songs: Music8PlaylistNormalizedSong[]; totalFetched: number; truncated: boolean } {
  const cappedMax = resolveMusic8PlaylistAutoplayMax(maxSongs);
  const withIds: Music8PlaylistNormalizedSong[] = [];
  for (const s of Array.isArray(rawSongs) ? rawSongs : []) {
    const videoId = String(s?.yt_video_id ?? '').trim();
    if (!isLikelyYoutubeVideoId(videoId)) continue;
    const title = String(s?.title ?? '').trim() || videoId;
    const artist =
      String(s?.first_artist ?? '').trim() ||
      (Array.isArray(s?.artists) && typeof s.artists[0] === 'string' ? s.artists[0].trim() : '') ||
      '';
    const music8SongId = typeof s?.id === 'number' && Number.isFinite(s.id) ? s.id : undefined;
    const postDate = typeof s?.post_date === 'string' ? s.post_date.trim() : undefined;
    withIds.push({
      videoId,
      title,
      artist,
      ...(music8SongId != null ? { music8SongId } : {}),
      ...(postDate ? { postDate } : {}),
    });
  }

  withIds.sort((a, b) => postDateSortKey(b.postDate) - postDateSortKey(a.postDate));

  const seen = new Set<string>();
  const deduped: Music8PlaylistNormalizedSong[] = [];
  for (const song of withIds) {
    if (seen.has(song.videoId)) continue;
    seen.add(song.videoId);
    deduped.push(song);
  }

  const totalFetched = deduped.length;
  if (cappedMax == null) {
    return { songs: deduped, totalFetched, truncated: false };
  }
  const truncated = totalFetched > cappedMax;
  return {
    songs: truncated ? deduped.slice(0, cappedMax) : deduped,
    totalFetched,
    truncated,
  };
}

async function fetchPlaylistUpstream(
  slug: string,
): Promise<{ status: number; json: Music8PlaylistRaw | null }> {
  const base = getMusic8WpRestBaseUrl();
  if (!base) return { status: 0, json: null };
  const url = `${base}/custom/v1/playlist/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'musicaichat-admin/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (res.status === 404) return { status: 404, json: null };
    if (!res.ok) return { status: res.status, json: null };
    const json = (await res.json()) as Music8PlaylistRaw;
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

export function buildMusic8PlaylistCanonicalUrl(slug: string): string {
  const parsed = parseMusic8PlaylistUrl(`https://xs867261.xsrv.jp/md/playlist/${slug}/`);
  if (parsed) return parsed.canonicalUrl;
  return `https://xs867261.xsrv.jp/md/playlist/${slug}/`;
}

/**
 * slug または公開 URL から正規化済みプレイリストを返す。
 */
export async function fetchNormalizedMusic8Playlist(params: {
  url?: string;
  slug?: string;
  /** `null` で曲数上限なし（STYLE_ADMIN） */
  maxSongs?: number | null;
}): Promise<Music8PlaylistFetchResult> {
  if (!isMusic8WpRestEnabled()) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'Music8 WordPress REST が無効です。',
    };
  }

  let slug = (params.slug ?? '').trim();
  let canonicalUrl = '';
  if (params.url?.trim()) {
    const parsed = parseMusic8PlaylistUrl(params.url.trim());
    if (!parsed) {
      return {
        ok: false,
        reason: 'invalid_url',
        message: 'Music8 プレイリストの URL として認識できませんでした。',
      };
    }
    slug = parsed.slug;
    canonicalUrl = parsed.canonicalUrl;
  } else if (slug) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
      return {
        ok: false,
        reason: 'invalid_url',
        message: 'プレイリストの slug が不正です。',
      };
    }
    canonicalUrl = buildMusic8PlaylistCanonicalUrl(slug);
  } else {
    return {
      ok: false,
      reason: 'invalid_url',
      message: 'url または slug を指定してください。',
    };
  }

  const { status, json } = await fetchPlaylistUpstream(slug);
  if (status === 404 || (status >= 200 && status < 300 && json == null)) {
    return {
      ok: false,
      reason: 'not_found',
      message: `プレイリスト「${slug}」が見つかりませんでした。`,
    };
  }
  if (!json || status < 200 || status >= 300) {
    return {
      ok: false,
      reason: 'upstream_error',
      message: 'Music8 プレイリストの取得に失敗しました。しばらくしてから再度お試しください。',
    };
  }

  const { songs, totalFetched, truncated } = normalizeMusic8PlaylistSongs(
    json.songs,
    params.maxSongs === undefined ? getMusic8PlaylistAutoplayMax() : params.maxSongs,
  );
  if (songs.length === 0) {
    return {
      ok: false,
      reason: 'empty_songs',
      message: '再生できる YouTube 動画がプレイリストにありませんでした。',
    };
  }

  const title = String(json.title ?? '').trim() || slug;
  return {
    ok: true,
    source: 'music8',
    playlist: {
      id: typeof json.id === 'number' ? json.id : 0,
      slug,
      title,
      url: canonicalUrl,
      description: String(json.description ?? '').trim(),
      thumbnail: String(json.thumbnail ?? '').trim(),
    },
    order: 'date_desc',
    truncated,
    totalFetched,
    songs,
  };
}
