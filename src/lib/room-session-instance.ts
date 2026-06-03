/** 同一 auth clientId のうち、どのブラウザタブが「操作中」かを presence で区別する */

const PREFIX = 'mc:room_session_inst:';

export function getRoomSessionInstanceStorageKey(roomId: string): string {
  return `${PREFIX}${roomId}`;
}

export function getOrCreateRoomSessionInstanceId(roomId: string): string {
  if (typeof window === 'undefined' || !roomId) return '';
  const key = getRoomSessionInstanceStorageKey(roomId);
  try {
    let id = sessionStorage.getItem(key);
    if (!id || !id.trim()) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `si-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `si-${Date.now()}`;
  }
}

/** この端末で操作権を取り直す直前に呼ぶ（presence の sessionInstanceId を更新する） */
export function regenerateRoomSessionInstanceId(roomId: string): string {
  if (typeof window === 'undefined' || !roomId) return '';
  const key = getRoomSessionInstanceStorageKey(roomId);
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `si-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  try {
    sessionStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
  return id;
}
