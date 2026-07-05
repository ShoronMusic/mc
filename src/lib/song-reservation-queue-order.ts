import {
  getSelectablePresentRing,
  type SelectionRoundParticipant,
} from '@/lib/room-selection-round';
import { resolveActivePublisherClientId } from '@/lib/room-publisher-identity';

export type SongReservationQueueEntryLike = {
  publisherClientId: string;
  publisherAuthUserId?: string;
  publisherDisplayName?: string;
};

export type QueueParticipantIdentity = {
  clientId: string;
  authUserId?: string;
  displayName?: string;
};

/** キュー行が指定参加者（ターン上の clientId）の予約か */
export function queueEntryMatchesParticipant(
  entry: SongReservationQueueEntryLike,
  participantClientId: string,
  participants: readonly QueueParticipantIdentity[],
  participantDisplayNameHint?: string,
): boolean {
  const cid = participantClientId.trim();
  if (!cid) return false;
  const pubId = entry.publisherClientId.trim();
  if (pubId && pubId === cid) return true;
  const row = participants.find((p) => p.clientId === cid);
  const auth = row?.authUserId?.trim();
  const entryAuth = entry.publisherAuthUserId?.trim();
  if (auth && entryAuth && auth === entryAuth) return true;
  if (pubId) {
    const resolved = resolveActivePublisherClientId(
      pubId,
      entryAuth,
      participants.map((p) => ({ clientId: p.clientId, authUserId: p.authUserId })),
    );
    if (resolved === cid) return true;
  }
  const name =
    participantDisplayNameHint?.trim() ||
    row?.displayName?.trim() ||
    '';
  const entryName = entry.publisherDisplayName?.trim();
  if (name && entryName && name === entryName) return true;
  return false;
}

/** 参加者が選曲予約キューに載っているか（clientId / authUserId / 表示名 / 再接続 ID を照合） */
export function participantHasQueuedReservation(
  participantClientId: string,
  queue: readonly SongReservationQueueEntryLike[],
  participants: readonly QueueParticipantIdentity[],
  participantDisplayNameHint?: string,
): boolean {
  const cid = participantClientId.trim();
  if (!cid || queue.length === 0) return false;
  return queue.some((e) =>
    queueEntryMatchesParticipant(e, cid, participants, participantDisplayNameHint),
  );
}

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
  /** authUserId 照合（省略時は participatingOrder の clientId のみ） */
  participantIdentities?: readonly QueueParticipantIdentity[];
}): ResolveSongReservationQueueApplyResult {
  const ring = getSelectablePresentRing(params.participatingOrder, params.presentClientIds);
  if (ring.length === 0 || params.queue.length === 0) return { kind: 'idle' };

  const identities: QueueParticipantIdentity[] = params.participantIdentities
    ? [...params.participantIdentities]
    : params.participatingOrder.map((p) => ({ clientId: p.clientId }));

  const cur = params.currentTurnClientId.trim();
  let startIdx = 0;
  if (cur) {
    const i = ring.indexOf(cur);
    if (i >= 0) startIdx = i;
  }

  for (let step = 0; step < ring.length; step++) {
    const cid = ring[(startIdx + step) % ring.length];
    const displayName = identities.find((p) => p.clientId === cid)?.displayName;
    const queueIndex = params.queue.findIndex((e) =>
      queueEntryMatchesParticipant(e, cid, identities, displayName),
    );
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
