import {
  GUEST_NAME_STORAGE_KEY,
  GUEST_ROOM_KEY,
  GUEST_STORAGE_KEY,
} from '@/lib/guest-room-storage-keys';

/** PWA 冷起動で sessionStorage が消えるため localStorage を主とする */

function readKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromLocal = localStorage.getItem(key)?.trim();
    if (fromLocal) return fromLocal;
    const fromSession = sessionStorage.getItem(key)?.trim();
    if (fromSession) {
      localStorage.setItem(key, fromSession);
      sessionStorage.removeItem(key);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const t = value.trim();
  if (!t && key !== GUEST_STORAGE_KEY) return;
  try {
    localStorage.setItem(key, t || value);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function rememberGuestRoom(roomId: string, displayName: string): void {
  writeKey(GUEST_STORAGE_KEY, '1');
  writeKey(GUEST_NAME_STORAGE_KEY, displayName.trim() || 'ゲスト');
  writeKey(GUEST_ROOM_KEY, roomId.trim());
}

export function clearGuestRoomPersistence(): void {
  removeKey(GUEST_STORAGE_KEY);
  removeKey(GUEST_NAME_STORAGE_KEY);
  removeKey(GUEST_ROOM_KEY);
}

export function hasGuestRoomPersistence(): boolean {
  return readKey(GUEST_STORAGE_KEY) === '1';
}

export function readGuestRoomForRoom(roomId: string): { displayName: string } | null {
  if (readKey(GUEST_STORAGE_KEY) !== '1') return null;
  const savedRoom = readKey(GUEST_ROOM_KEY);
  if (savedRoom !== roomId.trim()) return null;
  const name = readKey(GUEST_NAME_STORAGE_KEY);
  return { displayName: name && name.trim() ? name.trim() : 'ゲスト' };
}

export function readGuestDisplayNameHint(): string {
  return readKey(GUEST_NAME_STORAGE_KEY)?.trim() ?? '';
}
