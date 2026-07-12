/**
 * YouTube Data API v3 — アーティスト名から公式チャンネル候補を検索（Music8 WP 同系）
 */

import { resolveYoutubeChannelHref } from '@/lib/music8-artist-display';
import { persistYouTubeApiUsageLog } from '@/lib/youtube-api-usage-log';

export type YoutubeChannelCandidate = {
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  description: string | null;
};

export type SearchYoutubeChannelForArtistResult =
  | {
      ok: true;
      query: string;
      selected: YoutubeChannelCandidate;
      candidates: YoutubeChannelCandidate[];
    }
  | { ok: false; error: string };

function getApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

/** 「 - Topic」等の自動生成チャンネルを除外 */
export function isYoutubeTopicChannelTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/^\s*topic\s*$/i.test(t)) return true;
  return /\s*-\s*Topic\s*$/i.test(t);
}

function normalizeCompareKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreChannelCandidate(
  candidate: YoutubeChannelCandidate,
  artistName: string,
  nameJa: string | null,
): number {
  const titleKey = normalizeCompareKey(candidate.channelTitle);
  const qKey = normalizeCompareKey(artistName);
  const jaKey = nameJa ? normalizeCompareKey(nameJa) : '';
  let score = 0;
  if (qKey && titleKey === qKey) score += 100;
  if (jaKey && titleKey === jaKey) score += 100;
  if (qKey && titleKey.includes(qKey)) score += 40;
  if (jaKey && titleKey.includes(jaKey)) score += 40;
  if (/\bvevo\b/i.test(candidate.channelTitle)) score -= 30;
  if (/official/i.test(candidate.channelTitle)) score += 10;
  return score;
}

function pickBestChannel(
  candidates: YoutubeChannelCandidate[],
  artistName: string,
  nameJa: string | null,
): YoutubeChannelCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) =>
      scoreChannelCandidate(b, artistName, nameJa) - scoreChannelCandidate(a, artistName, nameJa),
  );
  return sorted[0] ?? null;
}

export async function searchYoutubeChannelForArtist(params: {
  artistName: string;
  nameJa?: string | null;
  maxResults?: number;
}): Promise<SearchYoutubeChannelForArtistResult> {
  const artistName = params.artistName.trim();
  if (!artistName) {
    return { ok: false, error: 'アーティスト名が空です。' };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: 'YOUTUBE_API_KEY が未設定です。' };
  }

  const maxResults = Math.min(50, Math.max(1, params.maxResults ?? 15));
  const q = params.nameJa?.trim() ? `${artistName} ${params.nameJa.trim()}` : artistName;

  const urlParams = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    q,
    maxResults: String(maxResults),
    key: apiKey,
  });

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${urlParams.toString()}`,
      { cache: 'no-store' },
    );
    const data = (await res.json().catch(() => ({}))) as {
      items?: Array<{
        id?: { channelId?: string };
        snippet?: { title?: string; description?: string };
      }>;
      error?: { message?: string; code?: number };
    };

    await persistYouTubeApiUsageLog({
      endpoint: 'search.list',
      queryText: q,
      maxResults,
      responseStatus: res.status,
      ok: res.ok,
      errorCode: data.error?.code != null ? String(data.error.code) : null,
      errorMessage: data.error?.message ?? null,
      resultCount: Array.isArray(data.items) ? data.items.length : 0,
      source: 'admin-youtube-channel-search',
    });

    if (!res.ok) {
      return {
        ok: false,
        error: data.error?.message ?? `YouTube API エラー（HTTP ${res.status}）`,
      };
    }

    const candidates: YoutubeChannelCandidate[] = [];
    for (const item of data.items ?? []) {
      const channelId = item.id?.channelId?.trim() ?? '';
      const channelTitle = item.snippet?.title?.trim() ?? '';
      if (!channelId || !channelTitle) continue;
      if (isYoutubeTopicChannelTitle(channelTitle)) continue;
      const channelUrl =
        resolveYoutubeChannelHref(channelId) ?? `https://www.youtube.com/channel/${channelId}`;
      candidates.push({
        channelId,
        channelTitle,
        channelUrl,
        description: item.snippet?.description?.trim() || null,
      });
    }

    if (candidates.length === 0) {
      return { ok: false, error: '「 - Topic」以外のチャンネルが見つかりませんでした。' };
    }

    const selected = pickBestChannel(candidates, artistName, params.nameJa ?? null);
    if (!selected) {
      return { ok: false, error: 'チャンネル候補の選定に失敗しました。' };
    }

    return {
      ok: true,
      query: q,
      selected,
      candidates,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'YouTube の取得に失敗しました。',
    };
  }
}
