import { NextResponse } from 'next/server';
import { isAiCharacterTtsEnabled } from '@/lib/ai-character-tts-config';
import { synthesizeAiCharacterSpeech } from '@/lib/ai-character-tts-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAiCharacterTtsEnabled()) {
    return NextResponse.json({ error: 'AI character TTS is disabled.' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text : '';
    const leadArtistJa =
      typeof body?.leadArtistJa === 'string' ? body.leadArtistJa.trim() : '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const result = await synthesizeAiCharacterSpeech(text, {
      leadArtistJa: leadArtistJa || undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('[api/ai/character-tts]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
