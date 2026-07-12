/** 同一 auth の操作権が別端末に移ったことを通知（presence より早く退室させる） */
export const ROOM_SESSION_CLAIM_EVENT = 'room:sessionClaim';

import { getRoomProductScopedStorageKey } from '@/lib/room-product-scope';

/** 強制退室後にトップで案内する sessionStorage キー（値は roomId）— product ごとに分離 */
export function getRoomSessionReplacedStorageKey(): string {
  return getRoomProductScopedStorageKey('mc:room_session_replaced:');
}

/** @deprecated use getRoomSessionReplacedStorageKey() */
export const ROOM_SESSION_REPLACED_STORAGE_KEY = 'mc:room_session_replaced';

export type RoomSessionClaimEventPayload = {
  authUserId: string;
  sessionInstanceId: string;
  sessionClaimedAtMs: number;
};
