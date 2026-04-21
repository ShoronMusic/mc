import { NextResponse } from 'next/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { generateSongQuizFromCommentary } from '@/lib/song-quiz-generate';
import {
  buildSongQuizApiExtension,
  isSongQuizAfterCommentaryEnabled,
} from '@/lib/song-quiz-after-commentary';
import { getVideoSnippet } from '@/lib/youtube-search';
import type { SongQuizPayload } from '@/lib/song-quiz-types';

export const dynamic = 'force-dynamic';

const MIN_COMMENTARY_CONTEXT = 60;

export async function POST(request: Request) {
  try {
    if (!isSongQuizAfterCommentaryEnabled()) {
      return NextResponse.json({ songQuiz: { enabled: false }, quiz: null as SongQuizPayload | null });
    }

    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const commentaryContext =
      typeof body?.commentaryContext === 'string' ? body.commentaryContext.trim() : '';

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const [oembed, snippet] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoSnippet(videoId, { roomId: roomId || undefined, source: 'api/ai/song-quiz' }),
    ]);

    const rawTitle = oembed?.title ?? snippet?.title ?? videoId;
    const authorName = oembed?.author_name ?? snippet?.channelTitle ?? null;

    const songQuizExtension = buildSongQuizApiExtension({
      channelId: snippet?.channelId ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      videoTitle: rawTitle,
      channelAuthorName: authorName,
      viewCount: snippet?.viewCount ?? null,
    });

    const sq = songQuizExtension.songQuiz;
    if (!sq.enabled || !('includeQuiz' in sq) || !sq.includeQuiz) {
      return NextResponse.json({
        ...songQuizExtension,
        quiz: null as SongQuizPayload | null,
        skipReason: sq.enabled ? (sq as { skipReason?: string }).skipReason : undefined,
      });
    }

    if (commentaryContext.length < MIN_COMMENTARY_CONTEXT) {
      return NextResponse.json({
        ...songQuizExtension,
        quiz: null as SongQuizPayload | null,
        skipReason: 'commentary_too_short',
      });
    }

    const quiz = await generateSongQuizFromCommentary(commentaryContext, {
      roomId: roomId || null,
      videoId,
    });
    return NextResponse.json({
      ...songQuizExtension,
      quiz,
    });
  } catch (e) {
    console.error('[api/ai/song-quiz]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
