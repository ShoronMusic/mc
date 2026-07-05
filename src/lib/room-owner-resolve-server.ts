import Ably from 'ably';
import type { PresenceMessage } from 'ably';
import {
  OWNER_ABSENCE_MS,
  authUserIdFromRoomClientId,
} from '@/lib/room-owner';
import { OWNER_STATE_EVENT, type OwnerStatePayload } from '@/types/room-owner';
import { allPresenceMembers } from '@/lib/ably-channel-presence';

function presenceTimestamp(m: PresenceMessage): number {
  return typeof m.timestamp === 'number' ? m.timestamp : 0;
}

function isOwnerPresentInMembers(ownerClientId: string, members: PresenceMessage[]): boolean {
  if (members.some((m) => m.clientId === ownerClientId)) return true;
  const authId = authUserIdFromRoomClientId(ownerClientId);
  if (!authId) return false;
  return members.some((m) => {
    const d = m.data as { authUserId?: string } | undefined;
    return typeof d?.authUserId === 'string' && d.authUserId.trim() === authId;
  });
}

/**
 * サーバー側で Ably の presence とチャネル履歴（owner:state）から、
 * 現在のチャットオーナーの clientId を推定する（クライアントの RoomWithSync と整合を狙う）。
 */
export async function resolveRoomOwnerClientId(
  rest: Ably.Rest,
  roomId: string,
  members: PresenceMessage[]
): Promise<string | null> {
  const sortedByJoin = [...members].sort((a, b) => presenceTimestamp(a) - presenceTimestamp(b));
  const oldestId = sortedByJoin[0]?.clientId ?? null;
  const now = Date.now();

  let latest: OwnerStatePayload | null = null;
  try {
    const channel = rest.channels.get(`room:${roomId}`);
    /** Ably REST の history が環境によっては応答しないことがあるためタイムアウトする */
    const HISTORY_MS = 5_000;
    const page = await Promise.race([
      channel.history({ direction: 'backwards', limit: 200 }),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), HISTORY_MS)),
    ]);
    if (page) {
      for (const msg of page.items) {
        if (msg.name !== OWNER_STATE_EVENT || msg.data == null || typeof msg.data !== 'object') continue;
        const d = msg.data as OwnerStatePayload;
        if (typeof d.ownerClientId !== 'string') continue;
        latest = {
          ownerClientId: d.ownerClientId,
          ownerLeftAt: typeof d.ownerLeftAt === 'number' ? d.ownerLeftAt : null,
        };
        break;
      }
    }
  } catch {
    /* history 取得不可時は下で oldest のみ */
  }

  if (!latest) {
    return oldestId;
  }

  const { ownerClientId, ownerLeftAt } = latest;
  const ownerPresent = isOwnerPresentInMembers(ownerClientId, members);

  if (ownerPresent) {
    return ownerClientId;
  }

  if (ownerLeftAt !== null && now - ownerLeftAt >= OWNER_ABSENCE_MS) {
    return oldestId;
  }

  if (ownerLeftAt !== null) {
    return null;
  }

  return oldestId;
}

export async function fetchRoomPresenceMembers(rest: Ably.Rest, roomId: string): Promise<PresenceMessage[]> {
  const channel = rest.channels.get(`room:${roomId}`);
  return allPresenceMembers(channel);
}
