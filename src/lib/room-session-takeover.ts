import { isAuthBasedRoomClientId } from '@/lib/room-owner';

export type RoomSessionTakeoverState = 'guest' | 'connecting' | 'active' | 'supplanted';

export type PresenceAuthRow = {
  clientId: string;
  authUserId?: string;
  sessionInstanceId?: string;
};

/** 操作可能とみなす Ably 接続状態 */
export const ROOM_SESSION_LIVE_CONNECTION_STATES = new Set<string>(['connected', 'connecting']);

/**
 * 同一 auth clientId + sessionInstanceId で「操作中」を1タブに限定。
 */
export function detectRoomSessionTakeoverState(input: {
  myClientId: string;
  mySessionInstanceId: string;
  authUserId: string | null;
  isGuest: boolean;
  presenceRows: PresenceAuthRow[];
  connectionState: string;
}): RoomSessionTakeoverState {
  if (input.isGuest || !input.authUserId?.trim()) return 'guest';
  if (!isAuthBasedRoomClientId(input.myClientId)) return 'connecting';

  const connectionLive = ROOM_SESSION_LIVE_CONNECTION_STATES.has(input.connectionState);
  const myPresence = input.presenceRows.find((p) => p.clientId === input.myClientId);
  const remoteInstanceId = myPresence?.sessionInstanceId?.trim() ?? '';
  const localInstanceId = input.mySessionInstanceId.trim();
  const holdsSession =
    Boolean(myPresence) &&
    Boolean(localInstanceId) &&
    remoteInstanceId === localInstanceId;

  if (connectionLive && holdsSession) return 'active';

  const authPresent = input.presenceRows.some((p) => p.authUserId?.trim() === input.authUserId!.trim());
  if (myPresence && remoteInstanceId && localInstanceId && remoteInstanceId !== localInstanceId) {
    return 'supplanted';
  }
  if (!connectionLive && authPresent) return 'supplanted';
  if (connectionLive && myPresence && !holdsSession) return 'supplanted';

  return 'connecting';
}
