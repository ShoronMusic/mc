/** 同一 auth の操作権が別端末に移ったことを通知（presence より早く退室させる） */
export const ROOM_SESSION_CLAIM_EVENT = 'room:sessionClaim';

/** 強制退室後にトップで案内する sessionStorage キー（値は roomId） */
export const ROOM_SESSION_REPLACED_STORAGE_KEY = 'mc:room_session_replaced';

export type RoomSessionClaimEventPayload = {
  authUserId: string;
  sessionInstanceId: string;
  sessionClaimedAtMs: number;
};
