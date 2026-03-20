import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { isYouTubeConfigured, searchYouTubeWithFallback } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    if (!isYouTubeConfigured()) {
      return NextResponse.json(
        { ok: false, reason: 'youtube_not_configured' },
        { status: 200 }
      );
    }

    const fallbackQueries = [query, `${query} official`, `${query} music`];
    const hit = await searchYouTubeWithFallback(fallbackQueries);
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
