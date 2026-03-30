import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { isYouTubeConfigured, searchYouTubeMany } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const maxResultsRaw = typeof body?.maxResults === 'number' ? body.maxResults : 5;
    const maxResults = Math.min(Math.max(Math.trunc(maxResultsRaw || 5), 1), 10);

    if (!query) return NextResponse.json({ results: [] }, { status: 200 });
    if (!isYouTubeConfigured()) {
      return NextResponse.json({ results: [], reason: 'youtube_not_configured' }, { status: 200 });
    }

    const results = await searchYouTubeMany(query, maxResults);
    const normalized = results.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      channelTitle: row.channelTitle,
      artistTitle: formatArtistTitle(row.title, row.channelTitle),
      thumbnailUrl: row.thumbnailUrl,
    }));
    return NextResponse.json({ results: normalized }, { status: 200 });
  } catch (e) {
    console.error('[api/ai/search-youtube]', e);
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}

