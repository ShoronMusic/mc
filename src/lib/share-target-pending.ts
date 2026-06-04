import { getSafeInternalReturnPath } from '@/lib/safe-return-path';

/** 共有で受け取った発言欄用テキスト（部屋で一度だけ消費） */
export const SHARE_PENDING_CHAT_TEXT_KEY = 'mc:share_pending_chat_text';

/** 直近で開いた部屋 ID（共有後のリダイレクト先） */
export const LAST_ACTIVE_ROOM_STORAGE_KEY = 'mc:last_active_room';

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
