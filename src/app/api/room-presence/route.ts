import Ably from 'ably';
import type { Channel, PresenceMessage } from 'ably';
import { NextResponse } from 'next/server';

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

async function allPresenceMembers(channel: Channel): Promise<PresenceMessage[]> {
  const out: PresenceMessage[] = [];
  let page = await channel.presence.get();
  out.push(...page.items);
  while (page.hasNext()) {
    const next = await page.next();
    if (!next) break;
    page = next;
    out.push(...page.items);
  }
  return out;
}

export type RoomPresencePayload = {
  roomId: string;
  count: number;
  names: string[];
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
        names.sort((a, b) => a.localeCompare(b, 'ja'));
        return { roomId, count: members.length, names };
      } catch (e) {
        console.error('[room-presence]', channelName, e);
        return { roomId, count: 0, names: [], error: true };
      }
    })
  );

  return NextResponse.json(
    { configured: true as const, rooms },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
