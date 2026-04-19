'use client';

import { useEffect } from 'react';

const STORAGE_PREFIX = 'mc_room_access_v1_';

function getOrCreateVisitorKey(roomId: string): string {
  if (typeof window === 'undefined') return '';
  const k = `${STORAGE_PREFIX}${roomId}`;
  try {
    let v = sessionStorage.getItem(k);
    if (!v || !/^[0-9a-f-]{36}$/i.test(v)) {
      v = crypto.randomUUID();
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return '';
  }
}

/**
 * 部屋を開いたときに 1 日 1 回まで POST /api/room-access-log で記録（ゲスト含む）。
 * gathering_id は room-live-status 取得後に付与できるときだけ載せる。
 */
export function useRoomAccessLogReport(
  roomId: string | undefined,
  options: { isGuest: boolean; displayName: string },
): void {
  const { isGuest, displayName } = options;

  useEffect(() => {
    const rid = roomId?.trim();
    if (!rid) return;
    let cancelled = false;

    void (async () => {
      let gatheringId: string | null = null;
      try {
        const r = await fetch(`/api/room-live-status?roomId=${encodeURIComponent(rid)}`, {
          credentials: 'include',
        });
        const data = r.ok ? await r.json().catch(() => null) : null;
        const raw = data?.room?.gatheringId;
        gatheringId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      } catch {
        gatheringId = null;
      }
      if (cancelled) return;

      const name = displayName.trim() || 'ゲスト';
      const payload: Record<string, unknown> = {
        roomId: rid,
        displayName: name,
        isGuest,
      };
      if (isGuest) {
        const vk = getOrCreateVisitorKey(rid);
        if (!vk) return;
        payload.visitorKey = vk;
      }
      if (gatheringId) payload.gatheringId = gatheringId;

      try {
        await fetch('/api/room-access-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } catch {
        /* 次回入室で再試行 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, isGuest, displayName]);
}
