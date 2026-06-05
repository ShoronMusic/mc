/** YouTube 共有などで JoinGate を再度通るとき、直前の入室状態を復元する */

const LAST_ROOM_ENTER_KEY = 'mc:last_room_enter_v1';
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

export type LastRoomEnterSnapshot = {
  roomId: string;
  displayName: string;
  isGuest: boolean;
  authUserId: string | null;
  atMs: number;
};

function readRaw(): LastRoomEnterSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_ROOM_ENTER_KEY);
    if (!raw) return null;
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
    localStorage.setItem(LAST_ROOM_ENTER_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function getLastRoomEnterForRoom(roomId: string): LastRoomEnterSnapshot | null {
  const snap = readRaw();
  if (!snap || snap.roomId !== roomId.trim()) return null;
  return snap;
}
