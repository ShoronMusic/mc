import { NextResponse } from 'next/server';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { checkYouTubeSearchRateLimit } from '@/lib/youtube-search-rate-limit';
import { resolveYoutubeQueryForPaste } from '@/lib/resolve-youtube-query-for-paste';
import { isYouTubeConfigured } from '@/lib/youtube-search';
import {
  isYoutubeAiCharacterServerResolveEnabled,
  isYoutubeKeywordSearchEnabled,
} from '@/lib/youtube-keyword-search-ui';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pasteIntent =
      typeof body?.pasteIntent === 'string' ? body.pasteIntent.trim().slice(0, 80) : '';
    const allowAiCharacterWithoutKeywordUi =
      pasteIntent.startsWith('ai_character') && isYoutubeAiCharacterServerResolveEnabled();
    if (!isYoutubeKeywordSearchEnabled() && !allowAiCharacterWithoutKeywordUi) {
      return NextResponse.json(
        { ok: false, reason: 'youtube_keyword_search_disabled' },
        { status: 200 },
      );
    }
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const isGuest = body?.isGuest === true;
    const pickConfirmationText =
      typeof body?.pickConfirmationText === 'string'
        ? body.pickConfirmationText.trim().slice(0, 240)
        : '';
    const rawExclude = body?.excludeVideoIds;
    const excludeVideoIds: string[] = Array.isArray(rawExclude)
      ? rawExclude
          .filter((x: unknown): x is string => typeof x === 'string' && x.trim() !== '')
          .map((x: string) => x.trim())
      : [];
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

    const resolved = await resolveYoutubeQueryForPaste({
      query,
      roomId: roomId || undefined,
      apiSource: 'api/ai/paste-by-query',
      excludeVideoIds,
    });
    if (!resolved.ok) {
      console.log('[paste-by-query] no hit for query:', query);
      return NextResponse.json({ ok: false, reason: 'no_hit' }, { status: 200 });
    }
    console.log('[paste-by-query] resolved_hit', {
      roomId: roomId || undefined,
      pasteIntent: pasteIntent || undefined,
      searchQuery: query,
      characterPickConfirmationText: pickConfirmationText || undefined,
      resolvedYoutubeTitle: resolved.title,
      resolvedArtistTitle: resolved.artistTitle,
      videoId: resolved.videoId,
      watchUrl: resolved.watchUrl,
      excludedVideoIds: excludeVideoIds.length > 0 ? excludeVideoIds : undefined,
    });
    if (pasteIntent.startsWith('ai_character')) {
      console.log(
        `[paste-by-query] AI_CHAR_PASTE_URL room=${roomId || ''} intent=${pasteIntent} videoId=${resolved.videoId} url=${resolved.watchUrl} artistTitle=${JSON.stringify(resolved.artistTitle)} query=${JSON.stringify(query)}`,
      );
    }

    return NextResponse.json({
      ok: true,
      videoId: resolved.videoId,
      title: resolved.title,
      channelTitle: resolved.channelTitle,
      artistTitle: resolved.artistTitle,
      watchUrl: resolved.watchUrl,
    });
  } catch (e) {
    console.error('[api/ai/paste-by-query]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
