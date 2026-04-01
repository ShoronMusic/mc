import { NextResponse } from 'next/server';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { checkYouTubeSearchRateLimit } from '@/lib/youtube-search-rate-limit';
import { formatArtistTitle } from '@/lib/format-song-display';
import { isYouTubeConfigured, searchYouTubeMany } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const isGuest = body?.isGuest === true;
    const maxResultsRaw = typeof body?.maxResults === 'number' ? body.maxResults : 5;
    const maxResults = Math.min(Math.max(Math.trunc(maxResultsRaw || 5), 1), 10);

    if (!query) return NextResponse.json({ results: [] }, { status: 200 });
    if (!isYouTubeConfigured()) {
      return NextResponse.json({ results: [], reason: 'youtube_not_configured' }, { status: 200 });
    }

    const rl = checkYouTubeSearchRateLimit(getChatAiClientIp(request), isGuest);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: 'rate_limit',
          message:
            'YouTube検索の操作が短時間に集中しています。しばらく待ってから再度お試しください。',
          retryAfterSec: rl.retryAfterSec,
          results: [],
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const results = await searchYouTubeMany(query, maxResults, {
      roomId: roomId || undefined,
      source: 'api/ai/search-youtube',
    });
    const normalized = results.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      publishedAt: row.publishedAt,
      artistTitle: formatArtistTitle(row.title, row.channelTitle),
      thumbnailUrl: row.thumbnailUrl,
    }));
    return NextResponse.json({ results: normalized }, { status: 200 });
  } catch (e) {
    console.error('[api/ai/search-youtube]', e);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}

