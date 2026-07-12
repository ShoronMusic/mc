/** PWA 冷起動・他アプリ復帰で JoinGate を再度通るとき、直前の入室状態を復元する */

import { getGatheringProductId, getRoomProductScopedStorageKey, PRODUCT_MA } from '@/lib/room-product-scope';

const LAST_ROOM_ENTER_BASE = 'mc:last_room_enter_v1:';
/** Step 2 以前（product 列なし）の ma 用キー */
const LEGACY_LAST_ROOM_ENTER_KEY = 'mc:last_room_enter_v1';
const MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** この時間以内なら「同じ端末の復帰」とみなし、端末選択モーダルを出さない */
export const ROOM_ENTER_RESUME_SKIP_GATE_MS = 30 * 60 * 1000;

export type LastRoomEnterSnapshot = {
  roomId: string;
  displayName: string;
  isGuest: boolean;
  authUserId: string | null;
  atMs: number;
};

function getLastRoomEnterStorageKey(): string {
  return getRoomProductScopedStorageKey(LAST_ROOM_ENTER_BASE);
}

function parseSnapshot(raw: string): LastRoomEnterSnapshot | null {
  try {
    const o = JSON.parse(raw) as LastRoomEnterSnapshot;
    if (!o?.roomId || typeof o.displayName !== 'string') return null;
    if (typeof o.atMs !== 'number' || Date.now() - o.atMs > MAX_AGE_MS) return null;
    return {
      roomId: o.roomId.trim(),
      displayName: o.displayName.trim() || 'ゲスト',
      isGuest: o.isGuest === true,
      authUserId:
        typeof o.authUserId === 'string' && o.authUserId.trim() ? o.authUserId.trim() : null,
      atMs: o.atMs,
    };
  } catch {
    return null;
  }
}

function readRaw(): LastRoomEnterSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getLastRoomEnterStorageKey();
    let raw = localStorage.getItem(key);
    if (!raw && getGatheringProductId() === PRODUCT_MA) {
      raw = localStorage.getItem(LEGACY_LAST_ROOM_ENTER_KEY);
      if (raw) {
        try {
          localStorage.setItem(key, raw);
          localStorage.removeItem(LEGACY_LAST_ROOM_ENTER_KEY);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return null;
    return parseSnapshot(raw);
  } catch {
    return null;
  }
}

export function rememberLastRoomEnter(input: {
  roomId: string;
  displayName: string;
  isGuest: boolean;
  authUserId: string | null;
}): void {
  if (typeof window === 'undefined') return;
  const roomId = input.roomId.trim();
  if (!roomId) return;
  const snap: LastRoomEnterSnapshot = {
    roomId,
    displayName: input.displayName.trim() || 'ゲスト',
    isGuest: input.isGuest,
    authUserId: input.authUserId?.trim() || null,
    atMs: Date.now(),
  };
  try {
    localStorage.setItem(getLastRoomEnterStorageKey(), JSON.stringify(snap));
    if (getGatheringProductId() === PRODUCT_MA) {
      localStorage.removeItem(LEGACY_LAST_ROOM_ENTER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getLastRoomEnterForRoom(roomId: string): LastRoomEnterSnapshot | null {
  const snap = readRaw();
  if (!snap || snap.roomId !== roomId.trim()) return null;
  return snap;
}

export function isRecentRoomEnter(
  snap: LastRoomEnterSnapshot | null | undefined,
  maxAgeMs: number = ROOM_ENTER_RESUME_SKIP_GATE_MS,
): boolean {
  if (!snap) return false;
  return Date.now() - snap.atMs <= maxAgeMs;
}

export function clearLastRoomEnter(roomId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getLastRoomEnterStorageKey();
    if (!roomId?.trim()) {
      localStorage.removeItem(key);
      if (getGatheringProductId() === PRODUCT_MA) {
        localStorage.removeItem(LEGACY_LAST_ROOM_ENTER_KEY);
      }
      return;
    }
    const snap = readRaw();
    if (snap?.roomId === roomId.trim()) {
      localStorage.removeItem(key);
      if (getGatheringProductId() === PRODUCT_MA) {
        localStorage.removeItem(LEGACY_LAST_ROOM_ENTER_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}
