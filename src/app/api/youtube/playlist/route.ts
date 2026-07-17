import { NextResponse } from 'next/server';
import { sessionIsStyleAdmin } from '@/lib/admin-access';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { fetchNormalizedYoutubePlaylist } from '@/lib/youtube-playlist-fetch';
import { checkYoutubePlaylistRateLimit } from '@/lib/youtube-playlist-rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const clientIp = getChatAiClientIp(request);
  const rl = checkYoutubePlaylistRateLimit(clientIp);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'rate_limit',
        message: 'YouTubeプレイリストの取得が短時間に集中しています。しばらく待ってから再度お試しください。',
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
  const playlistId = typeof obj.playlistId === 'string' ? obj.playlistId : undefined;
  // STYLE_ADMIN は AI 解説保存用に曲数上限なし
  const maxSongs = (await sessionIsStyleAdmin()) ? null : undefined;

  const result = await fetchNormalizedYoutubePlaylist({ url, playlistId, maxSongs });
  if (!result.ok) {
    const status =
      result.reason === 'invalid_url'
        ? 400
        : result.reason === 'not_configured'
          ? 503
          : result.reason === 'not_found' || result.reason === 'empty_songs'
            ? 404
            : 502;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
