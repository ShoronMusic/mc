import { NextResponse } from 'next/server';
import { extractSongSearchQuery } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userMessage = typeof body?.userMessage === 'string' ? body.userMessage.trim() : '';
    if (!userMessage) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const recentMessages = Array.isArray(body?.recentMessages)
      ? body.recentMessages.map((m: { displayName?: string; body?: string; messageType?: string }) => ({
          displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
          body: typeof m.body === 'string' ? m.body : '',
          messageType: typeof m.messageType === 'string' ? m.messageType : undefined,
        }))
      : undefined;

    const intent = await extractSongSearchQuery(userMessage, recentMessages);
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
