import type { PresenceMessage } from 'ably';

/** タブ閉じ後に残る ghost presence を入室前判定から除外する */
export const ROOM_AUTH_PRESENCE_STALE_MS = 45_000;

export function isLiveAuthPresenceMember(member: PresenceMessage, authClientId: string): boolean {
  if (member.clientId !== authClientId) return false;
  const ts = typeof member.timestamp === 'number' && Number.isFinite(member.timestamp) ? member.timestamp : 0;
  if (!ts) return true;
  return Date.now() - ts <= ROOM_AUTH_PRESENCE_STALE_MS;
}

export function hasLiveAuthClientInPresence(
  members: PresenceMessage[],
  authClientId: string,
): boolean {
  return members.some((m) => isLiveAuthPresenceMember(m, authClientId));
}
