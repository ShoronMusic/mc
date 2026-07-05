import { isTrialRoomId } from '@/lib/trial-rooms';
import { startRoomGatheringClient } from '@/lib/start-room-gathering-client';

export type RoomEntryGateResult =
  | { ok: true; liveTitle: string; roomDisplayTitle: string }
  | { ok: false; closedMessage: string; liveTitle: string; roomDisplayTitle: string };

type RoomLiveStatusPayload = {
  configured?: boolean;
  message?: string;
  room?: {
    isLive?: boolean;
    title?: string | null;
    displayTitle?: string | null;
    joinLocked?: boolean;
    canEnter?: boolean;
    isOrganizer?: boolean;
    canResume?: boolean;
  };
};

async function fetchRoomLiveStatus(roomId: string): Promise<RoomLiveStatusPayload> {
  const res = await fetch(`/api/room-live-status?roomId=${encodeURIComponent(roomId)}`, {
    credentials: 'include',
  });
  return (await res.json()) as RoomLiveStatusPayload;
}

/**
 * 部屋入室前のクライアント側ゲート（JoinGate と同じ条件）。
 * 名前入力後・URL 直打ち直後の両方で呼ぶこと。
 */
export async function runRoomEntryGateCheck(
  roomId: string,
  options?: { allowOrganizerResume?: boolean },
): Promise<RoomEntryGateResult> {
  const emptyTitles = { liveTitle: '', roomDisplayTitle: '' };
  const trialRoom = isTrialRoomId(roomId);
  const allowOrganizerResume = options?.allowOrganizerResume !== false;

  try {
    let data = await fetchRoomLiveStatus(roomId);

    if (
      allowOrganizerResume &&
      data?.configured === true &&
      data?.room?.isLive !== true &&
      !trialRoom &&
      data?.room?.isOrganizer === true &&
      data?.room?.canResume === true
    ) {
      const resumed = await startRoomGatheringClient(
        roomId,
        typeof data.room?.title === 'string' ? data.room.title : undefined,
      );
      if (resumed.ok) {
        data = await fetchRoomLiveStatus(roomId);
      }
    }

    if (data?.configured !== true) {
      return {
        ok: false,
        closedMessage: data?.message?.trim() || '現在この部屋は開催管理の準備中です。',
        ...emptyTitles,
      };
    }

    if (data?.room?.isLive !== true && !trialRoom) {
      return {
        ok: false,
        closedMessage: '現在この部屋で開催中の会はありません。',
        ...emptyTitles,
      };
    }

    const liveTitle =
      data?.room?.isLive === true && typeof data?.room?.title === 'string'
        ? data.room.title.trim()
        : trialRoom
          ? '体験部屋'
          : '';
    const roomDisplayTitle =
      data?.room?.isLive === true && typeof data?.room?.displayTitle === 'string'
        ? data.room.displayTitle.trim()
        : '';
    const joinLocked = data?.room?.joinLocked === true;
    const canEnter = data?.room?.canEnter !== false;
    if (joinLocked && !canEnter) {
      return {
        ok: false,
        closedMessage: 'この会は新規参加を締め切っています（既参加者は再入室できます）。',
        liveTitle,
        roomDisplayTitle,
      };
    }

    try {
      const p = await fetch(`/api/room-presence?rooms=${encodeURIComponent(roomId)}`, {
        credentials: 'include',
      });
      const pd = (await p.json()) as {
        configured?: boolean;
        rooms?: Array<{ roomId: string; count: number }>;
      };
      if (pd?.configured === true) {
        const row = Array.isArray(pd.rooms) ? pd.rooms.find((r) => r.roomId === roomId) : null;
        const count = row?.count ?? 0;
        const isOrganizer = data?.room?.isOrganizer === true;
        if (count === 0 && !isOrganizer && !isTrialRoomId(roomId)) {
          return {
            ok: false,
            closedMessage: '主催者の入室待ちです。主催者が先に入室すると参加できます。',
            liveTitle,
            roomDisplayTitle,
          };
        }
      }
    } catch {
      // 参加者数取得に失敗した場合は live 判定のみで通す（従来どおり）
    }

    return { ok: true, liveTitle, roomDisplayTitle };
  } catch {
    return {
      ok: false,
      closedMessage: '開催状況を確認できませんでした。時間をおいて再度お試しください。',
      ...emptyTitles,
    };
  }
}
