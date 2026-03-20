import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { isYouTubeConfigured, searchYouTubeMany } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const maxResultsRaw = typeof body?.maxResults === 'number' ? body.maxResults : 5;
    const maxResults = Math.min(Math.max(maxResultsRaw, 1), 10);

    if (!query) {
      return NextResponse.json({ ok: false, reason: 'empty_query', results: [] }, { status: 200 });
    }
    if (!isYouTubeConfigured()) {
      return NextResponse.json(
        { ok: false, reason: 'youtube_not_configured', results: [] },
        { status: 200 },
      );
    }

    const fallbackQueries = [query, `${query} official`, `${query} music`];
    let results: {
      videoId: string;
      title: string;
      channelTitle: string;
      artistTitle: string;
      thumbnailUrl?: string;
    }[] = [];

    for (const q of fallbackQueries) {
      const hits = await searchYouTubeMany(q, maxResults);
      if (hits.length === 0) continue;
      results = hits.map((h) => ({
        videoId: h.videoId,
        title: h.title,
        channelTitle: h.channelTitle,
        artistTitle: formatArtistTitle(h.title, h.channelTitle) || h.title,
        thumbnailUrl: h.thumbnailUrl,
      }));
      break;
    }

    return NextResponse.json(
      {
        ok: true,
        results,
      },
      { status: 200 },
    );
  } catch (e) {
    console.error('[api/ai/search-youtube]', e);
    return NextResponse.json({ ok: false, reason: 'server_error', results: [] }, { status: 200 });
  }
}

