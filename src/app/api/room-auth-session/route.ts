import Ably from 'ably';
import { NextResponse } from 'next/server';
import { allPresenceMembers } from '@/lib/ably-channel-presence';
import { hasLiveAuthClientInPresence } from '@/lib/room-auth-session-presence';
import { buildAuthRoomClientId } from '@/lib/room-owner';
import { getAblyRoomChannelName } from '@/lib/room-product-scope';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function getAblyKey(): string {
  return process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
}

function safeRoomId(raw: string | null): string | null {
  const t = (raw ?? '').trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * GET ?roomId=01
 * ログイン済みユーザーの auth clientId が既に部屋 presence にいるか（入室前の端末選択用）
 */
export async function GET(request: Request) {
  const roomId = safeRoomId(new URL(request.url).searchParams.get('roomId'));
  if (!roomId) {
    return NextResponse.json({ error: 'roomId が不正です。' }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase が未設定です。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  const key = getAblyKey();
  if (!key) {
    return NextResponse.json(
      { ok: true, configured: false, sameAccountInRoom: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const authClientId = buildAuthRoomClientId(user.id);
  try {
    const rest = new Ably.Rest({ key });
    const channel = rest.channels.get(getAblyRoomChannelName(roomId));
    const members = await allPresenceMembers(channel);
    const sameAccountInRoom = hasLiveAuthClientInPresence(members, authClientId);
    return NextResponse.json(
      { ok: true, configured: true, sameAccountInRoom, authClientId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[room-auth-session]', roomId, e);
    return NextResponse.json({ error: 'presence の確認に失敗しました。' }, { status: 502 });
  }
}
