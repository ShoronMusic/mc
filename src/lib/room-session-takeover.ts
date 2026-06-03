import { isAuthBasedRoomClientId } from '@/lib/room-owner';

export type RoomSessionTakeoverState = 'guest' | 'connecting' | 'active' | 'supplanted';

export type PresenceAuthRow = {
  clientId: string;
  authUserId?: string;
};

/** 操作可能とみなす Ably 接続状態 */
export const ROOM_SESSION_LIVE_CONNECTION_STATES = new Set<string>(['connected', 'connecting']);

/**
 * 同一 auth の複数端末（同一 Ably clientId）:
 * - 接続が生きていて presence に自分がいる → active
 * - 接続が切れているのに presence に同じ clientId がある → supplanted（他端末が接続中）
 */
export function detectRoomSessionTakeoverState(input: {
  myClientId: string;
  authUserId: string | null;
  isGuest: boolean;
  presenceRows: PresenceAuthRow[];
  connectionState: string;
}): RoomSessionTakeoverState {
  if (input.isGuest || !input.authUserId?.trim()) return 'guest';
  if (!isAuthBasedRoomClientId(input.myClientId)) return 'connecting';

  const aid = input.authUserId.trim();
  const connectionLive = ROOM_SESSION_LIVE_CONNECTION_STATES.has(input.connectionState);
  const imPresent = input.presenceRows.some((p) => p.clientId === input.myClientId);
  const authPresent = input.presenceRows.some((p) => p.authUserId?.trim() === aid);

  if (connectionLive && imPresent) return 'active';
  if (!connectionLive && (imPresent || authPresent)) return 'supplanted';
  if (connectionLive && !imPresent) return 'connecting';

  return 'connecting';
}
