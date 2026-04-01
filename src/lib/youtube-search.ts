/**
 * YouTube Data API v3 で検索（サーバー専用）
 * 環境変数 YOUTUBE_API_KEY が必要です。
 */
import { persistYouTubeApiUsageLog } from '@/lib/youtube-api-usage-log';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  /** 公開日時（RFC3339） */
  publishedAt?: string;
  /** 検索結果サムネイル（中サイズを優先） */
  thumbnailUrl?: string;
}

type YouTubeApiLogMeta = {
  roomId?: string | null;
  source?: string | null;
};

function getApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key : null;
}

/** API キーが設定されているか（サーバー専用） */
export function isYouTubeConfigured(): boolean {
  return getApiKey() != null;
}

export async function searchYouTube(
  query: string,
  maxResults = 5,
  meta?: YouTubeApiLogMeta
): Promise<YouTubeSearchResult | null> {
  const key = getApiKey();
  if (!key) {
    console.log('[youtube-search] YOUTUBE_API_KEY not set');
    return null;
  }
  const q = query.trim();
  if (!q) return null;
  const cappedMaxResults = Math.min(Math.max(maxResults, 1), 25);

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: String(cappedMaxResults),
    key,
  });
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      error?: { code?: number; message?: string; errors?: unknown[] };
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: {
            default?: { url?: string };
            medium?: { url?: string };
            high?: { url?: string };
          };
        };
      }>;
    };
    if (!res.ok) {
      console.log('[youtube-search] HTTP', res.status, data?.error?.message ?? '');
      await persistYouTubeApiUsageLog({
        endpoint: 'search.list',
        queryText: q,
        maxResults: cappedMaxResults,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data?.error?.code ?? ''),
        errorMessage: data?.error?.message ?? `HTTP ${res.status}`,
        resultCount: 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'searchYouTube',
      });
      return null;
    }
    if (data?.error) {
      console.log('[youtube-search] API error:', data.error.code, data.error.message);
      await persistYouTubeApiUsageLog({
        endpoint: 'search.list',
        queryText: q,
        maxResults: cappedMaxResults,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data.error.code ?? ''),
        errorMessage: data.error.message ?? 'api_error',
        resultCount: 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'searchYouTube',
      });
      return null;
    }
    const item = data.items?.[0];
    if (!item?.id?.videoId || !item.snippet) {
      console.log('[youtube-search] no items for q=', q.slice(0, 40));
      await persistYouTubeApiUsageLog({
        endpoint: 'search.list',
        queryText: q,
        maxResults: cappedMaxResults,
        responseStatus: res.status,
        ok: true,
        resultCount: 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'searchYouTube',
      });
      return null;
    }
    const thumbs = item.snippet.thumbnails;
    const thumbUrl =
      thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || undefined;
    const result = {
      videoId: item.id.videoId,
      title: item.snippet.title ?? '',
      channelTitle: item.snippet.channelTitle ?? '',
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: thumbUrl,
    };
    await persistYouTubeApiUsageLog({
      endpoint: 'search.list',
      queryText: q,
      maxResults: cappedMaxResults,
      responseStatus: res.status,
      ok: true,
      resultCount: Array.isArray(data.items) ? data.items.length : 1,
      roomId: meta?.roomId,
      source: meta?.source ?? 'searchYouTube',
    });
    return result;
  } catch (e) {
    console.log('[youtube-search] error:', e instanceof Error ? e.message : String(e));
    await persistYouTubeApiUsageLog({
      endpoint: 'search.list',
      queryText: q,
      maxResults: cappedMaxResults,
      ok: false,
      errorCode: 'fetch_error',
      errorMessage: e instanceof Error ? e.message : String(e),
      resultCount: 0,
      roomId: meta?.roomId,
      source: meta?.source ?? 'searchYouTube',
    });
    return null;
  }
}

export async function searchYouTubeMany(
  query: string,
  maxResults = 5,
  meta?: YouTubeApiLogMeta
): Promise<YouTubeSearchResult[]> {
  const key = getApiKey();
  if (!key) {
    console.log('[youtube-search] YOUTUBE_API_KEY not set');
    return [];
  }
  const q = query.trim();
  if (!q) return [];
  const cappedMaxResults = Math.min(Math.max(maxResults, 1), 25);

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: String(cappedMaxResults),
    key,
  });
  const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      error?: { code?: number; message?: string; errors?: unknown[] };
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: {
            default?: { url?: string };
            medium?: { url?: string };
            high?: { url?: string };
          };
        };
      }>;
    };
    if (!res.ok) {
      console.log('[youtube-search] HTTP', res.status, data?.error?.message ?? '');
      await persistYouTubeApiUsageLog({
        endpoint: 'search.list',
        queryText: q,
        maxResults: cappedMaxResults,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data?.error?.code ?? ''),
        errorMessage: data?.error?.message ?? `HTTP ${res.status}`,
        resultCount: 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'searchYouTubeMany',
      });
      return [];
    }
    if (data?.error) {
      console.log('[youtube-search] API error:', data.error.code, data.error.message);
      await persistYouTubeApiUsageLog({
        endpoint: 'search.list',
        queryText: q,
        maxResults: cappedMaxResults,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data.error.code ?? ''),
        errorMessage: data.error.message ?? 'api_error',
        resultCount: 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'searchYouTubeMany',
      });
      return [];
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const results: YouTubeSearchResult[] = [];
    for (const item of items) {
      const vid = item?.id?.videoId;
      const sn = item?.snippet;
      if (!vid || !sn) continue;
      const thumbs = sn.thumbnails;
      const thumbUrl =
        thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || undefined;
      results.push({
        videoId: vid,
        title: sn.title ?? '',
        channelTitle: sn.channelTitle ?? '',
        publishedAt: sn.publishedAt,
        thumbnailUrl: thumbUrl,
      });
    }
    await persistYouTubeApiUsageLog({
      endpoint: 'search.list',
      queryText: q,
      maxResults: cappedMaxResults,
      responseStatus: res.status,
      ok: true,
      resultCount: results.length,
      roomId: meta?.roomId,
      source: meta?.source ?? 'searchYouTubeMany',
    });
    return results;
  } catch (e) {
    console.log('[youtube-search] error:', e instanceof Error ? e.message : String(e));
    await persistYouTubeApiUsageLog({
      endpoint: 'search.list',
      queryText: q,
      maxResults: cappedMaxResults,
      ok: false,
      errorCode: 'fetch_error',
      errorMessage: e instanceof Error ? e.message : String(e),
      resultCount: 0,
      roomId: meta?.roomId,
      source: meta?.source ?? 'searchYouTubeMany',
    });
    return [];
  }
}

/** 複数のクエリで試行し、最初にヒットした結果を返す */
export async function searchYouTubeWithFallback(
  queries: string[],
  meta?: YouTubeApiLogMeta
): Promise<YouTubeSearchResult | null> {
  for (const q of queries) {
    if (!q.trim()) continue;
    const hit = await searchYouTube(q.trim(), 5, { ...meta, source: meta?.source ?? 'searchYouTubeWithFallback' });
    if (hit) return hit;
  }
  return null;
}

/**
 * 動画1本の snippet（タイトル・説明文・チャンネル名）を取得（サーバー専用）
 * 環境変数 YOUTUBE_API_KEY が必要です。
 * 説明文には「曲名 - アーティスト」や「Provided to YouTube by ...」などが含まれることがある。
 */
export interface VideoSnippet {
  title: string;
  description: string;
  channelTitle: string;
  /** ISO 8601 duration（例: PT5M1S） */
  duration?: string;
  /** 動画長さ（秒）。duration が取れた場合のみ */
  durationSeconds?: number | null;
  /** 公開日時（RFC3339） */
  publishedAt?: string;
  /** タグ（最大数はAPI側依存） */
  tags?: string[];
  /** サムネイルURL（高→中→低の優先） */
  thumbnailUrl?: string;
  /** YouTube channelId */
  channelId?: string;
  /** 音声トラックの言語（例: ja）。未取得時は undefined */
  defaultAudioLanguage?: string;
  /** 統計（数値はAPIの都合で文字列で来るため number に変換） */
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
}

export async function getVideoSnippet(videoId: string, meta?: YouTubeApiLogMeta): Promise<VideoSnippet | null> {
  const key = getApiKey();
  if (!key || !videoId.trim()) return null;
  const vid = videoId.trim();

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: vid,
    key,
  });
  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      error?: { code?: number; message?: string };
      items?: Array<{
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          tags?: string[];
          defaultAudioLanguage?: string;
          defaultLanguage?: string;
          thumbnails?: {
            default?: { url?: string };
            medium?: { url?: string };
            high?: { url?: string };
            standard?: { url?: string };
            maxres?: { url?: string };
          };
          channelId?: string;
        };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      }>;
    };
    if (!res.ok || data?.error || !data?.items?.length) {
      await persistYouTubeApiUsageLog({
        endpoint: 'videos.list',
        videoId: vid,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data?.error?.code ?? ''),
        errorMessage: data?.error?.message ?? (!res.ok ? `HTTP ${res.status}` : 'no_items'),
        resultCount: Array.isArray(data?.items) ? data.items.length : 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'getVideoSnippet',
      });
      return null;
    }
    const item = data.items[0];
    const sn = item?.snippet;
    if (!sn) return null;
    const thumbs = sn.thumbnails;
    const thumbUrl =
      thumbs?.maxres?.url ||
      thumbs?.standard?.url ||
      thumbs?.high?.url ||
      thumbs?.medium?.url ||
      thumbs?.default?.url ||
      undefined;

    const duration = item?.contentDetails?.duration;
    const durationSeconds = typeof duration === 'string' ? parseIso8601Duration(duration) : null;

    const toNum = (s?: string): number | null => {
      if (typeof s !== 'string' || !s.trim()) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const defaultAudioLanguage =
      typeof sn.defaultAudioLanguage === 'string' && sn.defaultAudioLanguage.trim()
        ? sn.defaultAudioLanguage.trim()
        : typeof sn.defaultLanguage === 'string' && sn.defaultLanguage.trim()
          ? sn.defaultLanguage.trim()
          : undefined;
    const result = {
      title: sn.title ?? '',
      description: sn.description ?? '',
      channelTitle: sn.channelTitle ?? '',
      publishedAt: sn.publishedAt,
      defaultAudioLanguage,
      tags: Array.isArray(sn.tags) ? sn.tags : undefined,
      thumbnailUrl: thumbUrl,
      channelId: sn.channelId,
      duration,
      durationSeconds,
      viewCount: toNum(item?.statistics?.viewCount),
      likeCount: toNum(item?.statistics?.likeCount),
      commentCount: toNum(item?.statistics?.commentCount),
    };
    await persistYouTubeApiUsageLog({
      endpoint: 'videos.list',
      videoId: vid,
      responseStatus: res.status,
      ok: true,
      resultCount: data.items.length,
      roomId: meta?.roomId,
      source: meta?.source ?? 'getVideoSnippet',
    });
    return result;
  } catch {
    await persistYouTubeApiUsageLog({
      endpoint: 'videos.list',
      videoId: vid,
      ok: false,
      errorCode: 'fetch_error',
      errorMessage: 'fetch_failed',
      resultCount: 0,
      roomId: meta?.roomId,
      source: meta?.source ?? 'getVideoSnippet',
    });
    return null;
  }
}

/**
 * YouTube Data API v3 で動画の長さ（秒）を取得（サーバー専用）
 * 環境変数 YOUTUBE_API_KEY が必要です。
 */
export async function getVideoDurationSeconds(
  videoId: string,
  meta?: YouTubeApiLogMeta
): Promise<number | null> {
  const key = getApiKey();
  if (!key || !videoId.trim()) return null;
  const vid = videoId.trim();

  const params = new URLSearchParams({
    part: 'contentDetails',
    id: vid,
    key,
  });
  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      error?: { code?: number; message?: string };
      items?: Array<{ contentDetails?: { duration?: string } }>;
    };
    if (!res.ok || data?.error || !data?.items?.length) {
      await persistYouTubeApiUsageLog({
        endpoint: 'videos.list',
        videoId: vid,
        responseStatus: res.status,
        ok: false,
        errorCode: String(data?.error?.code ?? ''),
        errorMessage: data?.error?.message ?? (!res.ok ? `HTTP ${res.status}` : 'no_items'),
        resultCount: Array.isArray(data?.items) ? data.items.length : 0,
        roomId: meta?.roomId,
        source: meta?.source ?? 'getVideoDurationSeconds',
      });
      return null;
    }
    const duration = data.items[0]?.contentDetails?.duration;
    const seconds = typeof duration === 'string' ? parseIso8601Duration(duration) : null;
    await persistYouTubeApiUsageLog({
      endpoint: 'videos.list',
      videoId: vid,
      responseStatus: res.status,
      ok: true,
      resultCount: data.items.length,
      roomId: meta?.roomId,
      source: meta?.source ?? 'getVideoDurationSeconds',
    });
    return seconds;
  } catch {
    await persistYouTubeApiUsageLog({
      endpoint: 'videos.list',
      videoId: vid,
      ok: false,
      errorCode: 'fetch_error',
      errorMessage: 'fetch_failed',
      resultCount: 0,
      roomId: meta?.roomId,
      source: meta?.source ?? 'getVideoDurationSeconds',
    });
    return null;
  }
}

/** ISO 8601 の duration（例: PT4M13S, PT1H2M30S）を秒に変換 */
function parseIso8601Duration(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return null;
  const hours = parseInt(m[1] ?? '0', 10);
  const minutes = parseInt(m[2] ?? '0', 10);
  const seconds = parseInt(m[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
