import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

/** 共有で受け取った発言欄用テキスト（部屋で一度だけ消費） */
export const SHARE_PENDING_CHAT_TEXT_KEY = 'mc:share_pending_chat_text';

/** 直近で開いた部屋 ID（共有後のリダイレクト先） */
export const LAST_ACTIVE_ROOM_STORAGE_KEY = 'mc:last_active_room';

/** 直近ログイン済み user.id（共有冷起動時の JoinGate 待機用・秘密情報ではない） */
export const KNOWN_AUTH_USER_ID_KEY = 'mc:join_gate_known_auth_user_id';

/** 共有から部屋へ入る直前フラグ（JoinGate のセッション待機を延長） */
export const SHARE_ENTER_ROOM_FLAG_KEY = 'mc:share_enter_room';

/**
 * Android PWA: YouTube 共有で別プロセス起動すると sessionStorage が空になる。
 * 共有・直近部屋は localStorage に保存する。
 */
function readPersisted(key: string): string | null {
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

function writePersisted(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const t = value.trim();
  if (!t) return;
  try {
    localStorage.setItem(key, t);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removePersisted(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function rememberKnownAuthUserId(userId: string | null | undefined): void {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) return;
  writePersisted(KNOWN_AUTH_USER_ID_KEY, id);
}

export function getKnownAuthUserId(): string | null {
  return readPersisted(KNOWN_AUTH_USER_ID_KEY);
}

export function clearKnownAuthUserId(): void {
  removePersisted(KNOWN_AUTH_USER_ID_KEY);
}

export function hasPendingShareChatText(): boolean {
  return Boolean(readPersisted(SHARE_PENDING_CHAT_TEXT_KEY));
}

export function rememberLastActiveRoom(roomSegment: string | null | undefined): void {
  const trimmed = typeof roomSegment === 'string' ? roomSegment.trim() : '';
  if (!trimmed) return;
  const path = getSafeInternalReturnPath(trimmed) ?? getSafeInternalReturnPath(`/${trimmed}`);
  if (!path) return;
  writePersisted(LAST_ACTIVE_ROOM_STORAGE_KEY, path.slice(1));
}

export function getLastActiveRoomSegment(): string | null {
  const raw = readPersisted(LAST_ACTIVE_ROOM_STORAGE_KEY);
  if (!raw) return null;
  const path = getSafeInternalReturnPath(raw) ?? getSafeInternalReturnPath(`/${raw}`);
  return path ? path.slice(1) : null;
}

export function setPendingShareChatText(watchUrl: string): void {
  writePersisted(SHARE_PENDING_CHAT_TEXT_KEY, watchUrl);
}

/** 発言欄へ入れる保留テキスト。取得後は削除 */
export function consumePendingShareChatText(): string | null {
  const raw = readPersisted(SHARE_PENDING_CHAT_TEXT_KEY);
  if (!raw) return null;
  removePersisted(SHARE_PENDING_CHAT_TEXT_KEY);
  return raw;
}

export function markShareRoomEnterPending(): void {
  writePersisted(SHARE_ENTER_ROOM_FLAG_KEY, '1');
}

export function consumeShareRoomEnterPending(): boolean {
  const v = readPersisted(SHARE_ENTER_ROOM_FLAG_KEY);
  if (v !== '1') return false;
  removePersisted(SHARE_ENTER_ROOM_FLAG_KEY);
  return true;
}

export function isShareRoomEnterPending(): boolean {
  return readPersisted(SHARE_ENTER_ROOM_FLAG_KEY) === '1';
}
