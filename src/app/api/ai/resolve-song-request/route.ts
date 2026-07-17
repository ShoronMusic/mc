import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { shouldShortCircuitSongRequestForAtPrompt } from '@/lib/ai-question-about-detail-heuristic';
import { extractSongSearchQuery } from '@/lib/gemini';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { checkAiCostRateLimit } from '@/lib/ai-cost-rate-limit';
import { aiCostRateLimitResponse } from '@/lib/ai-cost-rate-limit-response';
import { isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = typeof body?.userMessage === 'string' ? body.userMessage.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!userMessage) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const recentMessages = Array.isArray(body?.recentMessages)
      ? body.recentMessages.map((m: { displayName?: string; body?: string; messageType?: string }) => ({
          displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
          body: typeof m.body === 'string' ? m.body : '',
          messageType: typeof m.messageType === 'string' ? m.messageType : undefined,
        }))
      : [];

    if (shouldShortCircuitSongRequestForAtPrompt(userMessage, recentMessages)) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const supabase = await createClient();
    let requestUserId: string | null = null;
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      requestUserId = user?.id ?? null;
    }

    if (!requestUserId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'login_required',
          message: '選曲リクエストの解析はログインユーザーのみ利用できます。',
        },
        { status: 401 },
      );
    }

    if (!isAiUnlimitedUserId(requestUserId)) {
      const rate = checkAiCostRateLimit({
        bucket: 'resolve_song_request',
        clientIp: getChatAiClientIp(request),
        userId: requestUserId,
      });
      const limited = aiCostRateLimitResponse(rate);
      if (limited) return limited;
    }

    const intent = await extractSongSearchQuery(userMessage, recentMessages.length ? recentMessages : undefined, {
      roomId: roomId || undefined,
      userId: requestUserId,
    });
    if (!intent) {
      console.log('[resolve-song-request] no intent for:', userMessage.slice(0, 50));
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    console.log('[resolve-song-request] intent:', { query: intent.query, confirmation: intent.confirmationText });

    return NextResponse.json({
      needConfirm: true,
      confirmationText: intent.confirmationText,
      query: intent.query,
    });
  } catch (e) {
    console.error('[api/ai/resolve-song-request]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
