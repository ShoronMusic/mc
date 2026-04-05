/**
 * 選曲「ラウンド」カウント（チャットオーナー基準・sessionStorage で短期再入室に対応）
 */

/** 入室退室のあいだでも「同じ回」として扱う最大間隔（おかえり判定の上限と揃える） */
export const SELECTION_ROUND_SESSION_MAX_GAP_MS = 6 * 60 * 60 * 1000;

const STORAGE_PREFIX = 'mc_room_selection_round:v1:';

export function selectionRoundStorageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId.trim()}`;
}

export interface PersistedSelectionRound {
  round: number;
  ownerClientId: string;
  updatedAt: number;
}

export type SelectionRoundParticipant = {
  clientId: string;
  participatesInSelection?: boolean;
  isAway?: boolean;
};

/** 在室・選曲参加・非退席枠のみ、入室順のまま */
export function getSelectablePresentRing(
  participatingOrder: SelectionRoundParticipant[],
  presentClientIds: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const p of participatingOrder) {
    if (p.participatesInSelection === false) continue;
    if (!presentClientIds.has(p.clientId)) continue;
    if (p.isAway === true) continue;
    out.push(p.clientId);
  }
  return out;
}

/**
 * 選曲投稿後に順番が nextTurnClientId へ進んだときの次のラウンド数。
 * オーナーがリングにいれば「オーナーの番に戻った」で +1、いなければ最古参加者をアンカーに同様。
 */
export function computeNextSelectionRound(params: {
  previousRound: number;
  afterClientId: string;
  nextTurnClientId: string;
  ownerClientId: string;
  ring: string[];
}): number {
  const { previousRound, afterClientId, nextTurnClientId, ownerClientId, ring } = params;
  if (ring.length <= 1) return previousRound;
  const anchor =
    ownerClientId && ring.includes(ownerClientId) ? ownerClientId : ring[0] ?? '';
  if (!anchor || !nextTurnClientId || !afterClientId) return previousRound;
  if (nextTurnClientId === anchor && afterClientId !== anchor) {
    return previousRound + 1;
  }
  return previousRound;
}

export function readPersistedSelectionRound(
  roomId: string,
  currentOwnerClientId: string,
  maxGapMs: number = SELECTION_ROUND_SESSION_MAX_GAP_MS,
): number | null {
  if (typeof window === 'undefined' || !roomId.trim() || !currentOwnerClientId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(selectionRoundStorageKey(roomId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedSelectionRound>;
    if (
      typeof data.round !== 'number' ||
      !Number.isFinite(data.round) ||
      data.round < 1 ||
      typeof data.ownerClientId !== 'string' ||
      data.ownerClientId !== currentOwnerClientId ||
      typeof data.updatedAt !== 'number' ||
      !Number.isFinite(data.updatedAt)
    ) {
      return null;
    }
    if (Date.now() - data.updatedAt > maxGapMs) return null;
    return Math.floor(data.round);
  } catch {
    return null;
  }
}

export function persistSelectionRound(roomId: string, data: PersistedSelectionRound): void {
  if (typeof window === 'undefined' || !roomId.trim()) return;
  try {
    sessionStorage.setItem(selectionRoundStorageKey(roomId), JSON.stringify(data));
  } catch {
    /* noop */
  }
}
