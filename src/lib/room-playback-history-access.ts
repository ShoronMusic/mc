import Ably from 'ably';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRoomPresenceMembers } from '@/lib/room-owner-resolve-server';

const ABLY_VERIFY_MS = 9_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function getAblyKey(): string {
  return process.env.NEXT_PUBLIC_ABLY_API_KEY?.trim() ?? '';
}

/**
 * ログイン済みで、当該部屋に未終了（left_at が null）の参加履歴があるか。
 */
export async function userHasOpenParticipationInRoom(
  supabase: SupabaseClient,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_room_participation_history')
    .select('id')
    .eq('user_id', userId)
    .eq('room_id', roomId)
    .is('left_at', null)
    .limit(1);

  if (error) {
    if (error.code === '42P01') return false;
    console.error('[room-playback-history-access] participation check', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Ably の room チャネル presence に clientId が含まれるか。
 * @returns true / false / 'unconfigured'（キー未設定）
 */
export async function clientIdIsPresentInRoom(
  roomId: string,
  clientId: string,
): Promise<boolean | 'unconfigured'> {
  const key = getAblyKey();
  if (!key) return 'unconfigured';

  const rest = new Ably.Rest({ key });
  try {
    const members = await withTimeout(
      fetchRoomPresenceMembers(rest, roomId),
      ABLY_VERIFY_MS,
      'playback_history_presence',
    );
    return members.some((m) => m.clientId === clientId);
  } catch (e) {
    console.error('[room-playback-history-access] ably presence', e);
    return false;
  }
}

export type PlaybackHistoryReadGate = { allowed: true } | { allowed: false; reason: string };

/**
 * 視聴履歴 GET を許可するか。
 * - ログインかつ当該部屋の未終了参加履歴がある、または
 * - Ably 利用可能で clientId が当該部屋の presence にいる
 *
 * Ably 未設定時はログイン＋参加履歴のみ通す（RoomWithoutSync 等）。
 */
export async function gateRoomPlaybackHistoryRead(
  supabase: SupabaseClient,
  roomId: string,
  clientIdFromQuery: string | null,
): Promise<PlaybackHistoryReadGate> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;

  if (uid) {
    const inRoom = await userHasOpenParticipationInRoom(supabase, uid, roomId);
    if (inRoom) return { allowed: true };
  }

  const cid = clientIdFromQuery?.trim() ?? '';
  if (!cid) {
    return {
      allowed: false,
      reason: uid
        ? 'この部屋の参加記録がないか、まだ同期されていません。ページを更新するか、しばらく待ってから再度お試しください。'
        : '入室確認が必要です。ページを再読み込みするか、ゲストの場合は部屋に入室した状態でお試しください。',
    };
  }

  const present = await clientIdIsPresentInRoom(roomId, cid);
  if (present === true) return { allowed: true };

  if (present === 'unconfigured') {
    if (uid) {
      return {
        allowed: false,
        reason:
          '参加履歴を確認できませんでした。Ably が未設定の環境ではログインユーザーの参加記録が必要です。ページを再読み込みしてください。',
      };
    }
    return {
      allowed: false,
      reason: 'リアルタイム接続（Ably）が利用できないため、視聴履歴を取得できません。',
    };
  }

  return {
    allowed: false,
    reason: 'この部屋の参加者として確認できませんでした。',
  };
}
