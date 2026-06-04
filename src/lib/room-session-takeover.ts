import { isAuthBasedRoomClientId } from '@/lib/room-owner';
import type { RoomSessionClaim } from '@/lib/room-session-instance';

export type RoomSessionTakeoverState = 'guest' | 'connecting' | 'active' | 'supplanted';

export type PresenceAuthRow = {
  clientId: string;
  authUserId?: string;
  sessionInstanceId?: string;
  sessionClaimedAtMs?: number;
};

/** 操作可能とみなす Ably 接続状態 */
export const ROOM_SESSION_LIVE_CONNECTION_STATES = new Set<string>(['connected', 'connecting']);

function readRemoteClaimMs(row: PresenceAuthRow | undefined): number {
  if (!row) return 0;
  return typeof row.sessionClaimedAtMs === 'number' && Number.isFinite(row.sessionClaimedAtMs)
    ? row.sessionClaimedAtMs
    : 0;
}

/**
 * 同一 auth clientId: sessionClaimedAtMs が新しい端末が操作権を持つ。
 */
export function detectRoomSessionTakeoverState(input: {
  myClientId: string;
  mySessionClaim: RoomSessionClaim;
  authUserId: string | null;
  isGuest: boolean;
  presenceRows: PresenceAuthRow[];
  connectionState: string;
}): RoomSessionTakeoverState {
  if (input.isGuest || !input.authUserId?.trim()) return 'guest';
  if (!isAuthBasedRoomClientId(input.myClientId)) return 'connecting';

  const connectionLive = ROOM_SESSION_LIVE_CONNECTION_STATES.has(input.connectionState);
  const localInstanceId = input.mySessionClaim.instanceId.trim();
  const localClaimMs = input.mySessionClaim.claimedAtMs;
  const myPresence = input.presenceRows.find((p) => p.clientId === input.myClientId);
  const remoteInstanceId = myPresence?.sessionInstanceId?.trim() ?? '';
  const remoteClaimMs = readRemoteClaimMs(myPresence);

  const holdsSession =
    Boolean(myPresence) &&
    Boolean(localInstanceId) &&
    remoteInstanceId === localInstanceId &&
    remoteClaimMs === localClaimMs;

  /** ローカル claim が新しければ奪取側 — supplanted にはしない */
  if (localClaimMs > remoteClaimMs) {
    if (connectionLive && holdsSession) return 'active';
    return 'connecting';
  }

  if (connectionLive && holdsSession) return 'active';

  if (myPresence && remoteClaimMs > localClaimMs) return 'supplanted';
  if (myPresence && remoteClaimMs === localClaimMs && remoteInstanceId && remoteInstanceId !== localInstanceId) {
    return 'supplanted';
  }

  if (!connectionLive && myPresence && remoteClaimMs >= localClaimMs) return 'supplanted';

  if (connectionLive && myPresence && !holdsSession && remoteClaimMs >= localClaimMs && localClaimMs <= remoteClaimMs) {
    return 'supplanted';
  }

  return 'connecting';
}

/** supplanted の端末は presence を上書きしない（奪取ループ防止）。ただしローカル claim がより新しければ奪取 publish 可 */
export function shouldPublishRoomSessionPresence(input: {
  isGuest: boolean;
  myClientId: string;
  mySessionClaim: RoomSessionClaim;
  presenceRows: PresenceAuthRow[];
}): boolean {
  if (input.isGuest || !isAuthBasedRoomClientId(input.myClientId)) return true;

  const myPresence = input.presenceRows.find((p) => p.clientId === input.myClientId);
  if (!myPresence) return true;

  const remoteClaim = readRemoteClaimMs(myPresence);
  const localClaim = input.mySessionClaim.claimedAtMs;
  if (localClaim > remoteClaim) return true;
  if (localClaim < remoteClaim) return false;

  const remoteInst = myPresence.sessionInstanceId?.trim() ?? '';
  const localInst = input.mySessionClaim.instanceId.trim();
  return !remoteInst || remoteInst === localInst;
}
