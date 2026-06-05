/** 同一 auth clientId のうち、どのブラウザタブが「操作中」かを presence で区別する */

const PREFIX = 'mc:room_session_claim:';

export type RoomSessionClaim = {
  instanceId: string;
  claimedAtMs: number;
};

export function getRoomSessionClaimStorageKey(roomId: string): string {
  return `${PREFIX}${roomId}`;
}

function newInstanceId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `si-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function readClaimRaw(key: string): RoomSessionClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as { instanceId?: string; claimedAtMs?: number };
    const instanceId = typeof o.instanceId === 'string' ? o.instanceId.trim() : '';
    const claimedAtMs =
      typeof o.claimedAtMs === 'number' && Number.isFinite(o.claimedAtMs) ? o.claimedAtMs : 0;
    if (!instanceId) return null;
    return { instanceId, claimedAtMs };
  } catch {
    return null;
  }
}

function writeClaimRaw(key: string, claim: RoomSessionClaim): RoomSessionClaim {
  if (typeof window === 'undefined') return claim;
  try {
    const raw = JSON.stringify(claim);
    localStorage.setItem(key, raw);
    sessionStorage.setItem(key, raw);
  } catch {
    /* ignore */
  }
  return claim;
}

function readClaim(roomId: string): RoomSessionClaim | null {
  if (!roomId) return null;
  return readClaimRaw(getRoomSessionClaimStorageKey(roomId));
}

function writeClaim(roomId: string, claim: RoomSessionClaim): RoomSessionClaim {
  return writeClaimRaw(getRoomSessionClaimStorageKey(roomId), claim);
}

export function getOrCreateRoomSessionClaim(roomId: string): RoomSessionClaim {
  const existing = readClaim(roomId);
  if (existing) return existing;
  return writeClaim(roomId, { instanceId: newInstanceId(), claimedAtMs: Date.now() });
}

/** この端末で操作権を取り直す（新しい instanceId + より新しい claimedAtMs） */
export function regenerateRoomSessionClaim(roomId: string): RoomSessionClaim {
  const prev = readClaim(roomId);
  const claimedAtMs = Math.max(Date.now(), (prev?.claimedAtMs ?? 0) + 1);
  return writeClaim(roomId, { instanceId: newInstanceId(), claimedAtMs });
}

/** @deprecated use getOrCreateRoomSessionClaim */
export function getOrCreateRoomSessionInstanceId(roomId: string): string {
  return getOrCreateRoomSessionClaim(roomId).instanceId;
}

/** @deprecated use regenerateRoomSessionClaim */
export function regenerateRoomSessionInstanceId(roomId: string): string {
  return regenerateRoomSessionClaim(roomId).instanceId;
}
