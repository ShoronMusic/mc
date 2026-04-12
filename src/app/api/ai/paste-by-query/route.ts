import { NextResponse } from 'next/server';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { checkYouTubeSearchRateLimit } from '@/lib/youtube-search-rate-limit';
import { formatArtistTitle } from '@/lib/format-song-display';
import { isYouTubeConfigured, searchYouTubeWithFallback } from '@/lib/youtube-search';
import { isYoutubeKeywordSearchEnabled } from '@/lib/youtube-keyword-search-ui';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isYoutubeKeywordSearchEnabled()) {
      return NextResponse.json(
        { ok: false, reason: 'youtube_keyword_search_disabled' },
        { status: 200 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const isGuest = body?.isGuest === true;
    if (!query) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    if (!isYouTubeConfigured()) {
      return NextResponse.json(
        { ok: false, reason: 'youtube_not_configured' },
        { status: 200 }
      );
    }

    const rl = checkYouTubeSearchRateLimit(getChatAiClientIp(request), isGuest);
    if (!rl.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'rate_limit',
          message:
            'YouTube検索の操作が短時間に集中しています。しばらく待ってから再度お試しください。',
          retryAfterSec: rl.retryAfterSec,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const fallbackQueries = [query, `${query} official`, `${query} music`];
    const hit = await searchYouTubeWithFallback(fallbackQueries, {
      roomId: roomId || undefined,
      source: 'api/ai/paste-by-query',
    });
    if (!hit) {
      console.log('[paste-by-query] no hit for queries:', fallbackQueries);
      return NextResponse.json({ ok: false, reason: 'no_hit' }, { status: 200 });
    }
    console.log('[paste-by-query] hit:', hit.videoId, hit.title?.slice(0, 40));

    const artistTitle = formatArtistTitle(hit.title, hit.channelTitle);
    return NextResponse.json({
      ok: true,
      videoId: hit.videoId,
      title: hit.title,
      channelTitle: hit.channelTitle,
      artistTitle,
    });
  } catch (e) {
    console.error('[api/ai/paste-by-query]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
