import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

/** 共有で受け取った発言欄用テキスト（部屋で一度だけ消費） */
export const SHARE_PENDING_CHAT_TEXT_KEY = 'mc:share_pending_chat_text';

/** 直近で開いた部屋 ID（共有後のリダイレクト先） */
export const LAST_ACTIVE_ROOM_STORAGE_KEY = 'mc:last_active_room';

/** 直近ログイン済み user.id（共有冷起動時の JoinGate 待機用・秘密情報ではない） */
export const KNOWN_AUTH_USER_ID_KEY = 'mc:join_gate_known_auth_user_id';

export function rememberKnownAuthUserId(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) return;
  try {
    sessionStorage.setItem(KNOWN_AUTH_USER_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getKnownAuthUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KNOWN_AUTH_USER_ID_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function clearKnownAuthUserId(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KNOWN_AUTH_USER_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingShareChatText(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(sessionStorage.getItem(SHARE_PENDING_CHAT_TEXT_KEY)?.trim());
  } catch {
    return false;
  }
}

export function rememberLastActiveRoom(roomSegment: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const trimmed = typeof roomSegment === 'string' ? roomSegment.trim() : '';
  if (!trimmed) return;
  const path = getSafeInternalReturnPath(trimmed) ?? getSafeInternalReturnPath(`/${trimmed}`);
  if (!path) return;
  try {
    sessionStorage.setItem(LAST_ACTIVE_ROOM_STORAGE_KEY, path.slice(1));
  } catch {
    /* ignore */
  }
}

export function getLastActiveRoomSegment(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVE_ROOM_STORAGE_KEY)?.trim();
    if (!raw) return null;
    const path = getSafeInternalReturnPath(raw) ?? getSafeInternalReturnPath(`/${raw}`);
    return path ? path.slice(1) : null;
  } catch {
    return null;
  }
}

export function setPendingShareChatText(watchUrl: string): void {
  if (typeof window === 'undefined') return;
  const t = watchUrl.trim();
  if (!t) return;
  try {
    sessionStorage.setItem(SHARE_PENDING_CHAT_TEXT_KEY, t);
  } catch {
    /* ignore */
  }
}

/** 発言欄へ入れる保留テキスト。取得後は削除 */
export function consumePendingShareChatText(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SHARE_PENDING_CHAT_TEXT_KEY)?.trim();
    if (!raw) return null;
    sessionStorage.removeItem(SHARE_PENDING_CHAT_TEXT_KEY);
    return raw;
  } catch {
    return null;
  }
}
