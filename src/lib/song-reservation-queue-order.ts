import {
  getSelectablePresentRing,
  type SelectionRoundParticipant,
} from '@/lib/room-selection-round';

export type SongReservationQueueEntryLike = {
  publisherClientId: string;
  publisherAuthUserId?: string;
};

export type ResolveSongReservationQueueApplyResult =
  | { kind: 'apply'; queueIndex: number }
  | { kind: 'prompt'; clientId: string }
  | { kind: 'idle' };

/**
 * 選曲予約キューから次に処理すべきエントリを決める。
 * ターン順で先の参加者が未予約なら再生せず prompt。予約済みならその人のキュー行を apply（FIFO 先頭が後ろの人でも可）。
 */
export function resolveSongReservationQueueApply(params: {
  currentTurnClientId: string;
  participatingOrder: SelectionRoundParticipant[];
  presentClientIds: ReadonlySet<string>;
  queue: SongReservationQueueEntryLike[];
}): ResolveSongReservationQueueApplyResult {
  const ring = getSelectablePresentRing(params.participatingOrder, params.presentClientIds);
  if (ring.length === 0 || params.queue.length === 0) return { kind: 'idle' };

  const cur = params.currentTurnClientId.trim();
  let startIdx = 0;
  if (cur) {
    const i = ring.indexOf(cur);
    if (i >= 0) startIdx = i;
  }

  for (let step = 0; step < ring.length; step++) {
    const cid = ring[(startIdx + step) % ring.length];
    const queueIndex = params.queue.findIndex((e) => e.publisherClientId.trim() === cid);
    if (queueIndex < 0) {
      return { kind: 'prompt', clientId: cid };
    }
    return { kind: 'apply', queueIndex };
  }

  return { kind: 'idle' };
}

/** 直接選曲時: 投稿者自身の予約行だけ除去し、他参加者のキューは維持する */
export function removePublisherReservationFromQueue<T extends SongReservationQueueEntryLike>(
  queue: T[],
  publisherClientId: string,
  publisherAuthUserId?: string,
): T[] {
  const pid = publisherClientId.trim();
  const auth = publisherAuthUserId?.trim();
  if (!pid && !auth) return queue;
  return queue.filter((e) => {
    if (pid && e.publisherClientId.trim() === pid) return false;
    if (auth && e.publisherAuthUserId?.trim() === auth) return false;
    return true;
  });
}

/**
 * 再生中または曲終了直後に、既存の選曲予約があるなら即時差し替えではなくキューへ回す。
 */
export function shouldForceReservationQueueWhilePending(params: {
  queueLength: number;
  hasActiveVideo: boolean;
  withinEndedGraceWindow: boolean;
  participatingCount: number;
  uniqueDisplayNameCount: number;
}): boolean {
  if (params.queueLength <= 0) return false;
  if (params.participatingCount <= 1) return false;
  if (params.participatingCount > 1 && params.uniqueDisplayNameCount === 1) return false;
  return params.hasActiveVideo || params.withinEndedGraceWindow;
}
