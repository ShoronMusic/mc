import { NextResponse } from 'next/server';
import { checkChatAiRateLimit, getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { updateAiCharacterSongPickLogUtterance } from '@/lib/ai-character-song-pick-log';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pickLogId = typeof body?.pickLogId === 'string' ? body.pickLogId.trim() : '';
    const pickedVideoId = typeof body?.pickedVideoId === 'string' ? body.pickedVideoId.trim() : '';
    const utterance = typeof body?.utterance === 'string' ? body.utterance.trim() : '';
    const isGuest = body?.isGuest === true;
    if (!pickLogId || !utterance) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    const rl = checkChatAiRateLimit(getChatAiClientIp(request), isGuest);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, throttled: true, retryAfterSec: rl.retryAfterSec },
        { status: 200 },
      );
    }
    const ok = await updateAiCharacterSongPickLogUtterance({
      pickLogId,
      utterance,
      pickedVideoId: pickedVideoId || undefined,
    });
    return NextResponse.json({ ok });
  } catch (e) {
    console.error('[api/ai/character-song-pick-utterance]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
