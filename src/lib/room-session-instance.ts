/** 同一 auth clientId のうち、どのブラウザタブが「操作中」かを presence で区別する */

import { getGatheringProductId, getRoomProductScopedStorageKey, PRODUCT_MA } from '@/lib/room-product-scope';

const PREFIX = 'mc:room_session_claim:';

export type RoomSessionClaim = {
  instanceId: string;
  claimedAtMs: number;
  browserTabId: string;
};

const BROWSER_TAB_ID_KEY = 'mc:browser_tab_id';

export function getRoomSessionClaimStorageKey(roomId: string): string {
  return getRoomProductScopedStorageKey(PREFIX, roomId);
}

function getLegacyRoomSessionClaimStorageKey(roomId: string): string {
  return `${PREFIX}${roomId.trim()}`;
}

function newInstanceId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `si-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** タブごとに sessionStorage に保持（同一タブのリロードでは不変） */
export function getBrowserTabId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(BROWSER_TAB_ID_KEY);
    if (!id) {
      id = newInstanceId();
      sessionStorage.setItem(BROWSER_TAB_ID_KEY, id);
    }
    return id;
  } catch {
    return newInstanceId();
  }
}

function parseClaimRaw(raw: string): RoomSessionClaim | null {
  try {
    const o = JSON.parse(raw) as {
      instanceId?: string;
      claimedAtMs?: number;
      browserTabId?: string;
    };
    const instanceId = typeof o.instanceId === 'string' ? o.instanceId.trim() : '';
    const claimedAtMs =
      typeof o.claimedAtMs === 'number' && Number.isFinite(o.claimedAtMs) ? o.claimedAtMs : 0;
    const browserTabId = typeof o.browserTabId === 'string' ? o.browserTabId.trim() : '';
    if (!instanceId) return null;
    return { instanceId, claimedAtMs, browserTabId };
  } catch {
    return null;
  }
}

function readClaimRaw(key: string): RoomSessionClaim | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return null;
    return parseClaimRaw(raw);
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
  const key = getRoomSessionClaimStorageKey(roomId);
  let claim = readClaimRaw(key);
  if (!claim && getGatheringProductId() === PRODUCT_MA) {
    claim = readClaimRaw(getLegacyRoomSessionClaimStorageKey(roomId));
    if (claim) writeClaimRaw(key, claim);
  }
  return claim;
}

function writeClaim(roomId: string, claim: RoomSessionClaim): RoomSessionClaim {
  return writeClaimRaw(getRoomSessionClaimStorageKey(roomId), claim);
}

/** localStorage 上の claim（テスト・JoinGate 用） */
export function readRoomSessionClaim(roomId: string): RoomSessionClaim | null {
  return readClaim(roomId);
}

/** このタブが localStorage 上の claim を保持しているか */
export function isRoomClaimOwnedByThisBrowserTab(roomId: string): boolean {
  const claim = readClaim(roomId);
  if (!claim) return true;
  const tabId = getBrowserTabId();
  if (!claim.browserTabId) return false;
  return claim.browserTabId === tabId;
}

export function getOrCreateRoomSessionClaim(roomId: string): RoomSessionClaim {
  const tabId = getBrowserTabId();
  const existing = readClaim(roomId);
  if (existing?.browserTabId === tabId) {
    return existing;
  }
  if (existing && !existing.browserTabId) {
    return writeClaim(roomId, { ...existing, browserTabId: tabId });
  }
  const claimedAtMs = Math.max(Date.now(), (existing?.claimedAtMs ?? 0) + 1);
  return writeClaim(roomId, {
    instanceId: newInstanceId(),
    claimedAtMs,
    browserTabId: tabId,
  });
}

/** この端末で操作権を取り直す（新しい instanceId + より新しい claimedAtMs） */
export function regenerateRoomSessionClaim(roomId: string): RoomSessionClaim {
  const prev = readClaim(roomId);
  const tabId = getBrowserTabId();
  const claimedAtMs = Math.max(Date.now(), (prev?.claimedAtMs ?? 0) + 1);
  return writeClaim(roomId, { instanceId: newInstanceId(), claimedAtMs, browserTabId: tabId });
}

/** @deprecated use getOrCreateRoomSessionClaim */
export function getOrCreateRoomSessionInstanceId(roomId: string): string {
  return getOrCreateRoomSessionClaim(roomId).instanceId;
}

/** @deprecated use regenerateRoomSessionClaim */
export function regenerateRoomSessionInstanceId(roomId: string): string {
  return regenerateRoomSessionClaim(roomId).instanceId;
}
