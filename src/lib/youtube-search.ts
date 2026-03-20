/**
 * YouTube Data API v3 で検索（サーバー専用）
 * 環境変数 YOUTUBE_API_KEY が必要です。
 */

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  /** 検索結果サムネイル（中サイズを優先） */
  thumbnailUrl?: string;
}

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
  maxResults = 5
): Promise<YouTubeSearchResult | null> {
  const key = getApiKey();
  if (!key) {
    console.log('[youtube-search] YOUTUBE_API_KEY not set');
    return null;
  }
  const q = query.trim();
  if (!q) return null;

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: String(Math.min(Math.max(maxResults, 1), 25)),
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
      return null;
    }
    if (data?.error) {
      console.log('[youtube-search] API error:', data.error.code, data.error.message);
      return null;
    }
    const item = data.items?.[0];
    if (!item?.id?.videoId || !item.snippet) {
      console.log('[youtube-search] no items for q=', q.slice(0, 40));
      return null;
    }
    const thumbs = item.snippet.thumbnails;
    const thumbUrl =
      thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || undefined;
    return {
      videoId: item.id.videoId,
      title: item.snippet.title ?? '',
      channelTitle: item.snippet.channelTitle ?? '',
      thumbnailUrl: thumbUrl,
    };
  } catch (e) {
    console.log('[youtube-search] error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function searchYouTubeMany(
  query: string,
  maxResults = 5
): Promise<YouTubeSearchResult[]> {
  const key = getApiKey();
  if (!key) {
    console.log('[youtube-search] YOUTUBE_API_KEY not set');
    return [];
  }
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: String(Math.min(Math.max(maxResults, 1), 25)),
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
      return [];
    }
    if (data?.error) {
      console.log('[youtube-search] API error:', data.error.code, data.error.message);
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
        thumbnailUrl: thumbUrl,
      });
    }
    return results;
  } catch (e) {
    console.log('[youtube-search] error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/** 複数のクエリで試行し、最初にヒットした結果を返す */
export async function searchYouTubeWithFallback(queries: string[]): Promise<YouTubeSearchResult | null> {
  for (const q of queries) {
    if (!q.trim()) continue;
    const hit = await searchYouTube(q.trim(), 5);
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
  /** 統計（数値はAPIの都合で文字列で来るため number に変換） */
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
}

export async function getVideoSnippet(videoId: string): Promise<VideoSnippet | null> {
  const key = getApiKey();
  if (!key || !videoId.trim()) return null;

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoId.trim(),
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
    if (!res.ok || data?.error || !data?.items?.length) return null;
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
    return {
      title: sn.title ?? '',
      description: sn.description ?? '',
      channelTitle: sn.channelTitle ?? '',
      publishedAt: sn.publishedAt,
      tags: Array.isArray(sn.tags) ? sn.tags : undefined,
      thumbnailUrl: thumbUrl,
      channelId: sn.channelId,
      duration,
      durationSeconds,
      viewCount: toNum(item?.statistics?.viewCount),
      likeCount: toNum(item?.statistics?.likeCount),
      commentCount: toNum(item?.statistics?.commentCount),
    };
  } catch {
    return null;
  }
}

/**
 * YouTube Data API v3 で動画の長さ（秒）を取得（サーバー専用）
 * 環境変数 YOUTUBE_API_KEY が必要です。
 */
export async function getVideoDurationSeconds(videoId: string): Promise<number | null> {
  const key = getApiKey();
  if (!key || !videoId.trim()) return null;

  const params = new URLSearchParams({
    part: 'contentDetails',
    id: videoId.trim(),
    key,
  });
  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    const data = (await res.json()) as {
      error?: { code?: number; message?: string };
      items?: Array<{ contentDetails?: { duration?: string } }>;
    };
    if (!res.ok || data?.error || !data?.items?.length) return null;
    const duration = data.items[0]?.contentDetails?.duration;
    if (typeof duration !== 'string') return null;
    return parseIso8601Duration(duration);
  } catch {
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
