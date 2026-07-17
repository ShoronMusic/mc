/**
 * 部屋に紐づくコスト経路（character-chat 等）の在室ゲート。
 * playback-history と同じ基準を共有する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clientIdIsPresentInRoom,
  userHasOpenParticipationInRoom,
} from '@/lib/room-playback-history-access';

export type RoomPresenceGate =
  | { allowed: true }
  | { allowed: false; status: number; error: string; message: string };

export async function gateRoomCostRouteAccess(params: {
  supabase: SupabaseClient | null;
  roomId: string;
  clientId?: string | null;
  userId?: string | null;
  /**
   * Ably 未設定／非同期部屋向け。true のとき roomId が妥当なら許可（レート制限が主防御）。
   * character-chat の RoomWithoutSync 用。
   */
  allowWhenAblyUnconfigured?: boolean;
}): Promise<RoomPresenceGate> {
  const roomId = params.roomId.trim();
  if (!roomId || roomId.length > 128) {
    return {
      allowed: false,
      status: 400,
      error: 'room_id_required',
      message: 'roomId が必要です。',
    };
  }

  const uid = params.userId?.trim() || null;
  if (uid && params.supabase) {
    const inRoom = await userHasOpenParticipationInRoom(params.supabase, uid, roomId);
    if (inRoom) return { allowed: true };
  }

  const cid = params.clientId?.trim() || '';
  if (cid) {
    const present = await clientIdIsPresentInRoom(roomId, cid);
    if (present === true) return { allowed: true };

    if (present === 'unconfigured') {
      if (params.allowWhenAblyUnconfigured) return { allowed: true };
      if (uid) {
        return {
          allowed: false,
          status: 403,
          error: 'room_presence_unavailable',
          message:
            '参加履歴を確認できませんでした。ページを再読み込みしてから再度お試しください。',
        };
      }
      return {
        allowed: false,
        status: 503,
        error: 'ably_unconfigured',
        message: 'リアルタイム接続が利用できないため、この操作を実行できません。',
      };
    }

    return {
      allowed: false,
      status: 403,
      error: 'not_in_room',
      message: 'この部屋の参加者として確認できませんでした。',
    };
  }

  if (params.allowWhenAblyUnconfigured) {
    const present = await clientIdIsPresentInRoom(roomId, '__probe__');
    if (present === 'unconfigured') return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    error: 'room_presence_required',
    message: uid
      ? 'この部屋の参加記録を確認できませんでした。ページを更新してから再度お試しください。'
      : '入室確認が必要です。部屋に入室した状態で再度お試しください。',
  };
}
