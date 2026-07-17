import { NextResponse } from 'next/server';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { fetchNormalizedMusic8Playlist } from '@/lib/music8-playlist-fetch';
import { checkMusic8PlaylistRateLimit } from '@/lib/music8-playlist-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const clientIp = getChatAiClientIp(request);
  const rl = checkMusic8PlaylistRateLimit(clientIp);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'rate_limit',
        message: 'Music8プレイリストの取得が短時間に集中しています。しばらく待ってから再度お試しください。',
        retryAfterSec: rl.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_url', message: 'JSON ボディが必要です。' },
      { status: 400 },
    );
  }

  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const url = typeof obj.url === 'string' ? obj.url : undefined;
  const slug = typeof obj.slug === 'string' ? obj.slug : undefined;

  const result = await fetchNormalizedMusic8Playlist({ url, slug });
  if (!result.ok) {
    const status =
      result.reason === 'invalid_url'
        ? 400
        : result.reason === 'not_found' || result.reason === 'empty_songs'
          ? 404
          : result.reason === 'disabled'
            ? 503
            : 502;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
