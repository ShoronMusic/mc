import { NextResponse } from 'next/server';
import Ably from 'ably';
import { createClient } from '@/lib/supabase/server';
import { getAblyServerApiKey } from '@/lib/ably-server-key';
import {
  getAblyRoomChannelName,
  getLegacyAblyRoomChannelName,
} from '@/lib/room-product-scope';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import {
  checkSlidingWindowRateLimit,
  parseRateLimitEnv,
} from '@/lib/sliding-window-rate-limit';

export const dynamic = 'force-dynamic';

const MAX_ROOM_ID = 128;
const MAX_CLIENT_ID = 128;

function getTokenRateStore(): { map?: Map<string, number[]> } {
  const g = globalThis as unknown as { __ablyTokenRateStore?: { map?: Map<string, number[]> } };
  if (!g.__ablyTokenRateStore) g.__ablyTokenRateStore = {};
  return g.__ablyTokenRateStore;
}

/**
 * Ably Token Request を発行。capability は対象部屋チャネルのみ。
 * Body/Query: roomId, clientId（必須）
 */
export async function POST(request: Request) {
  try {
    const key = getAblyServerApiKey();
    if (!key) {
      return NextResponse.json(
        { error: 'ably_unconfigured', message: 'ABLY_API_KEY が未設定です。' },
        { status: 503 },
      );
    }

    let body: { roomId?: string; clientId?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const url = new URL(request.url);
    const roomId =
      (typeof body.roomId === 'string' ? body.roomId.trim() : '') ||
      url.searchParams.get('roomId')?.trim() ||
      '';
    const clientId =
      (typeof body.clientId === 'string' ? body.clientId.trim() : '') ||
      url.searchParams.get('clientId')?.trim() ||
      '';

    if (!roomId || roomId.length > MAX_ROOM_ID) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 });
    }
    if (!clientId || clientId.length > MAX_CLIENT_ID) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_.:-]+$/.test(clientId)) {
      return NextResponse.json({ error: 'clientId is invalid' }, { status: 400 });
    }

    const supabase = await createClient();
    let userId: string | null = null;
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    const ip = getChatAiClientIp(request);
    const max = parseRateLimitEnv(process.env.ABLY_TOKEN_RATE_LIMIT_PER_MINUTE, 30);
    const rl = checkSlidingWindowRateLimit({
      store: getTokenRateStore(),
      key: `ably-token:${userId || ip}`,
      max,
    });
    if (!rl.ok) {
      return NextResponse.json(
        {
          error: 'rate_limit',
          message: '接続トークンの発行が短時間に集中しています。',
          retryAfterSec: rl.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      );
    }

    const primary = getAblyRoomChannelName(roomId);
    const legacy = getLegacyAblyRoomChannelName(roomId);
    const capability = JSON.stringify({
      [primary]: ['publish', 'subscribe', 'presence', 'history'],
      [legacy]: ['publish', 'subscribe', 'presence', 'history'],
    });

    const rest = new Ably.Rest({ key });
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId,
      capability,
      ttl: 60 * 60 * 1000,
    });

    return NextResponse.json(tokenRequest);
  } catch (e) {
    console.error('[api/ably/token]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** Ably authUrl は GET も使うことがあるため同一処理 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId') ?? '';
  const clientId = url.searchParams.get('clientId') ?? '';
  const synthetic = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, clientId }),
  });
  return POST(synthetic);
}
