import Ably from 'ably';
import { allPresenceMembers } from '@/lib/ably-channel-presence';

function getAblyKey(): string {
  return process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
}

function safeRoomId(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t || t.length > 48) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
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
      return false;
    }
  }
  return false;
}

/** ルーム内の誰かが「邦楽解禁=ON」を同期していれば true（セッション設定） */
export async function isRoomJpAiUnlockEnabled(roomId: string | null | undefined): Promise<boolean> {
  const rid = safeRoomId(roomId);
  if (!rid) return false;
  const key = getAblyKey();
  if (!key) return false;
  try {
    const rest = new Ably.Rest({ key });
    const channel = rest.channels.get(`room:${rid}`);
    const members = await allPresenceMembers(channel);
    return members.some((m) => jpAiUnlockFromPresenceData(m.data));
  } catch (e) {
    console.error('[room-jp-ai-unlock-server] presence check failed', rid, e);
    return false;
  }
}
