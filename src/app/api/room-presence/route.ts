import Ably from 'ably';
import { NextResponse } from 'next/server';
import { allPresenceMembers } from '@/lib/ably-channel-presence';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_ROOMS = 24;

function getAblyKey(): string {
  return process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
}

function safeRoomId(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

function displayNameFromPresenceData(data: unknown): string {
  if (data && typeof data === 'object' && data !== null && 'displayName' in data) {
    const d = (data as { displayName?: unknown }).displayName;
    if (typeof d === 'string') {
      const s = d.trim();
      return s || 'ゲスト';
    }
  }
  if (typeof data === 'string') {
    try {
      const o = JSON.parse(data) as { displayName?: string };
      if (typeof o?.displayName === 'string' && o.displayName.trim()) return o.displayName.trim();
    } catch {
      /* ignore */
    }
  }
  return 'ゲスト';
}

function jpAiUnlockFromPresenceData(data: unknown): boolean {
  if (data && typeof data === 'object' && data !== null && 'jpAiUnlockEnabled' in data) {
    return (data as { jpAiUnlockEnabled?: unknown }).jpAiUnlockEnabled === true;
  }
  if (typeof data === 'string') {
    try {
      const o = JSON.parse(data) as { jpAiUnlockEnabled?: unknown };
      return o?.jpAiUnlockEnabled === true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export type RoomPresencePayload = {
  roomId: string;
  count: number;
  names: string[];
  /** オーナーが設定した入室前メッセージ（未設定・DB なし時は省略） */
  lobbyMessage?: string;
  /** オーナー設定: 邦楽AI解説を解禁中（セッション設定） */
  jpAiUnlockEnabled?: boolean;
  error?: boolean;
};

/**
 * GET ?rooms=01,02,03
 * Ably channel `room:{roomId}` の presence を列挙（トップページの参加状況表示用）
 */
export async function GET(request: Request) {
  const key = getAblyKey();
  if (!key) {
    return NextResponse.json(
      { configured: false as const, rooms: [] as RoomPresencePayload[] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawList = searchParams.get('rooms') ?? '01,02,03';
  const parsed = rawList
    .split(',')
    .map((s) => safeRoomId(s))
    .filter((x): x is string => x != null);
  const unique = Array.from(new Set(parsed)).slice(0, MAX_ROOMS);

  const rest = new Ably.Rest({ key });
  const rooms: RoomPresencePayload[] = await Promise.all(
    unique.map(async (roomId) => {
      const channelName = `room:${roomId}`;
      try {
        const channel = rest.channels.get(channelName);
        const members = await allPresenceMembers(channel);
        const names = members.map((m) => displayNameFromPresenceData(m.data));
        const jpAiUnlockEnabled = members.some((m) => jpAiUnlockFromPresenceData(m.data));
        names.sort((a, b) => a.localeCompare(b, 'ja'));
        return { roomId, count: members.length, names, jpAiUnlockEnabled };
      } catch (e) {
        console.error('[room-presence]', channelName, e);
        return { roomId, count: 0, names: [], error: true };
      }
    })
  );

  /** 誰もいない部屋の入室前メッセージは DB から削除（古いテスト文言の残留を防ぐ） */
  const emptyRoomIds = rooms.filter((r) => r.count === 0 && !r.error).map((r) => r.roomId);
  if (emptyRoomIds.length > 0) {
    const admin = createAdminClient();
    if (admin) {
      const { error: delErr } = await admin.from('room_lobby_message').delete().in('room_id', emptyRoomIds);
      if (delErr && delErr.code !== '42P01') {
        console.error('[room-presence] delete room_lobby_message for empty rooms', delErr);
      }
    }
  }

  const supabase = await createClient();
  if (supabase && unique.length > 0) {
    const { data: lobbyRows, error: lobbyErr } = await supabase
      .from('room_lobby_message')
      .select('room_id, message')
      .in('room_id', unique);
    if (lobbyErr && lobbyErr.code !== '42P01') {
      console.error('[room-presence] room_lobby_message', lobbyErr);
    }
    if (!lobbyErr && lobbyRows?.length) {
      const byRoom = new Map<string, string>();
      for (const row of lobbyRows as { room_id?: string; message?: string }[]) {
        const rid = typeof row.room_id === 'string' ? row.room_id : '';
        const msg = typeof row.message === 'string' ? row.message.trim() : '';
        if (rid && msg) byRoom.set(rid, msg);
      }
      for (const r of rooms) {
        const m = byRoom.get(r.roomId);
        /** 在室 0 のときは表示しない（削除失敗時もゴースト表示を防ぐ） */
        if (m && r.count > 0 && !r.error) r.lobbyMessage = m;
      }
    }
  }

  return NextResponse.json(
    { configured: true as const, rooms },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
