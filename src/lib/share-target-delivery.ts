/** 部屋が既に開いているとき、共有で別タブ／再読込せず発言欄へ URL を渡す */

export const SHARE_TARGET_DELIVERY_CHANNEL = 'mc-share-target-v1';
export const SHARE_SET_CHAT_TEXT_EVENT = 'mc:share-set-chat-text';

export type ShareDeliverPayload = {
  watchUrl: string;
  roomId: string | null;
};

const DELIVERY_WAIT_MS = 900;

/**
 * /share から呼ぶ。部屋側が受け取れば true（BroadcastChannel または storage イベント）。
 */
export async function tryDeliverShareToOpenRoom(payload: ShareDeliverPayload): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const watchUrl = payload.watchUrl.trim();
  if (!watchUrl) return false;

  const roomId = payload.roomId?.trim() || null;

  if ('BroadcastChannel' in window) {
    const delivered = await new Promise<boolean>((resolve) => {
      const bc = new BroadcastChannel(SHARE_TARGET_DELIVERY_CHANNEL);
      const requestId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bc.close();
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), DELIVERY_WAIT_MS);
      bc.onmessage = (ev) => {
        const d = ev.data as { type?: string; requestId?: string };
        if (d?.type === 'share-ack' && d.requestId === requestId) finish(true);
      };
      bc.postMessage({ type: 'share-deliver', requestId, watchUrl, roomId });
    });
    if (delivered) return true;
  }

  return false;
}

/** 部屋マウント時に登録。受け取ったら true を返して ack する */
export function listenShareTargetDelivery(
  handler: (payload: ShareDeliverPayload) => boolean,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (e: Event) => {
    if (!(e instanceof CustomEvent)) return;
    const raw = (e.detail as { text?: unknown })?.text;
    if (typeof raw !== 'string' || !raw.trim()) return;
    handler({ watchUrl: raw.trim(), roomId: null });
  };
  window.addEventListener(SHARE_SET_CHAT_TEXT_EVENT, onCustom);

  if (!('BroadcastChannel' in window)) {
    return () => window.removeEventListener(SHARE_SET_CHAT_TEXT_EVENT, onCustom);
  }

  const bc = new BroadcastChannel(SHARE_TARGET_DELIVERY_CHANNEL);
  bc.onmessage = (ev) => {
    const d = ev.data as {
      type?: string;
      requestId?: string;
      watchUrl?: string;
      roomId?: string | null;
    };
    if (d?.type !== 'share-deliver' || !d.requestId) return;
    const watchUrl = typeof d.watchUrl === 'string' ? d.watchUrl.trim() : '';
    if (!watchUrl) return;
    const roomId =
      typeof d.roomId === 'string' && d.roomId.trim() ? d.roomId.trim() : null;
    const handled = handler({ watchUrl, roomId });
    if (handled) {
      bc.postMessage({ type: 'share-ack', requestId: d.requestId });
    }
  };

  return () => {
    window.removeEventListener(SHARE_SET_CHAT_TEXT_EVENT, onCustom);
    bc.close();
  };
}
