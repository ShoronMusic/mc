/** ログイン済み: 同じ auth の clientId が既に部屋 presence にいるか */

export type RoomAuthSessionCheckResult =
  | { ok: true; configured: false; sameAccountInRoom: false }
  | { ok: true; configured: true; sameAccountInRoom: boolean }
  | { ok: false; error: string };

export async function fetchRoomAuthSessionCheck(roomId: string): Promise<RoomAuthSessionCheckResult> {
  const rid = roomId.trim();
  if (!rid) return { ok: false, error: 'roomId が不正です。' };
  try {
    const res = await fetch(`/api/room-auth-session?roomId=${encodeURIComponent(rid)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      configured?: boolean;
      sameAccountInRoom?: boolean;
      error?: string;
    } | null;
    if (res.status === 401) {
      return { ok: true, configured: true, sameAccountInRoom: false };
    }
    if (!res.ok) {
      return { ok: false, error: typeof data?.error === 'string' ? data.error : '確認に失敗しました。' };
    }
    if (data?.configured === false) {
      return { ok: true, configured: false, sameAccountInRoom: false };
    }
    return {
      ok: true,
      configured: true,
      sameAccountInRoom: Boolean(data?.sameAccountInRoom),
    };
  } catch {
    return { ok: false, error: '確認に失敗しました。' };
  }
}
