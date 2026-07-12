'use client';

import { useEffect, useState } from 'react';
import { ROOM_SESSION_REPLACED_STORAGE_KEY, getRoomSessionReplacedStorageKey } from '@/lib/room-session-events';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

/** 別端末入室により退室したとき、トップで一度だけ案内 */
export function SessionReplacedNotice() {
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storageKey = getRoomSessionReplacedStorageKey();
      const id = sessionStorage.getItem(storageKey)?.trim()
        ?? sessionStorage.getItem(ROOM_SESSION_REPLACED_STORAGE_KEY)?.trim();
      if (!id) return;
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(ROOM_SESSION_REPLACED_STORAGE_KEY);
      setRoomId(id);
    } catch {
      /* ignore */
    }
  }, []);

  if (!roomId) return null;

  return (
    <div
      className={
        IS_MC_PRODUCT
          ? 'mx-auto mb-4 w-full max-w-lg rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800'
          : 'mx-auto mb-4 w-full max-w-lg rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100'
      }
      role="status"
    >
      共有などで同じ部屋がもう一度開かれたため、部屋{' '}
      <span className={`font-mono ${IS_MC_PRODUCT ? 'text-gray-900' : 'text-amber-50'}`}>{roomId}</span>{' '}
      から一旦退室しました。下の一覧から同じ部屋を選べば、そのまま再入室できます（ログインは継続しています）。
    </div>
  );
}
