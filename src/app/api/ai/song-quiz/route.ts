import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { generateSongQuizFromCommentary } from '@/lib/song-quiz-generate';
import {
  buildSongQuizApiExtension,
  isSongQuizAfterCommentaryEnabled,
} from '@/lib/song-quiz-after-commentary';
import { getVideoSnippet } from '@/lib/youtube-search';
import type { SongQuizPayload } from '@/lib/song-quiz-types';
import { insertSongQuizLog } from '@/lib/song-quiz-log';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { guardAiTrialSongSelection } from '@/lib/user-ai-trial-server';
import { checkAiCostRateLimit } from '@/lib/ai-cost-rate-limit';
import { aiCostRateLimitResponse } from '@/lib/ai-cost-rate-limit-response';
import { isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';

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

    const supabase = await createClient();
    let authUser = null;
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData.user ?? null;
    }
    const requestIsGuest = !authUser?.id;

    if (!(authUser?.id && isAiUnlimitedUserId(authUser.id))) {
      const rate = checkAiCostRateLimit({
        bucket: 'song_quiz',
        clientIp: getChatAiClientIp(request),
        userId: authUser?.id,
        isGuest: requestIsGuest,
      });
      const limited = aiCostRateLimitResponse(rate);
      if (limited) return limited;
    }

    const trialGuard = await guardAiTrialSongSelection({
      user: authUser,
      isGuest: requestIsGuest,
      aiModeRaw: body?.aiMode,
      clientIp: getChatAiClientIp(request),
      consume: false,
    });
    if (!trialGuard.ok) {
      return NextResponse.json(trialGuard.body, { status: trialGuard.status });
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

    let selectorUserId: string | null = authUser?.id ?? null;

    const quiz = await generateSongQuizFromCommentary(commentaryContext, {
      roomId: roomId || null,
      videoId,
      userId: selectorUserId,
    });
    if (quiz) {
      void insertSongQuizLog({
        videoId,
        roomId: roomId || null,
        commentaryContext,
        quiz,
      });
    }
    return NextResponse.json({
      ...songQuizExtension,
      quiz,
    });
  } catch (e) {
    console.error('[api/ai/song-quiz]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
