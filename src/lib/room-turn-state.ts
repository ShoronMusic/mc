/**
 * 選曲ターン（currentTurnClientId）の sessionStorage 永続化。
 * 再接続直後・Ably 同期前でも「今誰の番か」を復元する。
 */

import {
  SELECTION_ROUND_SESSION_MAX_GAP_MS,
  selectionRoundGatheringMatches,
} from '@/lib/room-selection-round';
import { buildJoinOrderIdentityKey } from '@/lib/room-participant-join-order';

const STORAGE_PREFIX = 'mc_room_turn_state:v1:';

export function turnStateStorageKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId.trim()}`;
}

export interface PersistedTurnState {
  currentTurnClientId: string;
  updatedAt: number;
  gatheringStartedAt?: string;
  turnAuthUserId?: string;
  turnGuestDisplayName?: string;
}

export interface ReadPersistedTurnStateOptions {
  gatheringStartedAt?: string | null;
  maxGapMs?: number;
}

export function readPersistedTurnState(
  roomId: string,
  options: ReadPersistedTurnStateOptions = {},
): PersistedTurnState | null {
  if (typeof window === 'undefined' || !roomId.trim()) return null;
  const maxGapMs = options.maxGapMs ?? SELECTION_ROUND_SESSION_MAX_GAP_MS;
  try {
    const raw = sessionStorage.getItem(turnStateStorageKey(roomId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedTurnState>;
    if (
      typeof data.currentTurnClientId !== 'string' ||
      !data.currentTurnClientId.trim() ||
      typeof data.updatedAt !== 'number' ||
      !Number.isFinite(data.updatedAt)
    ) {
      return null;
    }
    if (Date.now() - data.updatedAt > maxGapMs) return null;
    if (!selectionRoundGatheringMatches(data.gatheringStartedAt, options.gatheringStartedAt)) {
      return null;
    }
    return {
      currentTurnClientId: data.currentTurnClientId.trim(),
      updatedAt: data.updatedAt,
      ...(typeof data.gatheringStartedAt === 'string' && data.gatheringStartedAt.trim()
        ? { gatheringStartedAt: data.gatheringStartedAt.trim() }
        : {}),
      ...(typeof data.turnAuthUserId === 'string' && data.turnAuthUserId.trim()
        ? { turnAuthUserId: data.turnAuthUserId.trim() }
        : {}),
      ...(typeof data.turnGuestDisplayName === 'string' && data.turnGuestDisplayName.trim()
        ? { turnGuestDisplayName: data.turnGuestDisplayName.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

export function buildTurnStatePersistData(params: {
  currentTurnClientId: string;
  gatheringStartedAt?: string | null;
  turnAuthUserId?: string | null;
  turnGuestDisplayName?: string | null;
}): PersistedTurnState {
  const currentTurnClientId = params.currentTurnClientId.trim();
  const gatheringStartedAt =
    typeof params.gatheringStartedAt === 'string' && params.gatheringStartedAt.trim()
      ? params.gatheringStartedAt.trim()
      : undefined;
  const turnAuthUserId =
    typeof params.turnAuthUserId === 'string' && params.turnAuthUserId.trim()
      ? params.turnAuthUserId.trim()
      : undefined;
  const turnGuestDisplayName =
    typeof params.turnGuestDisplayName === 'string' && params.turnGuestDisplayName.trim()
      ? params.turnGuestDisplayName.trim()
      : undefined;
  return {
    currentTurnClientId,
    updatedAt: Date.now(),
    ...(gatheringStartedAt ? { gatheringStartedAt } : {}),
    ...(turnAuthUserId ? { turnAuthUserId } : {}),
    ...(turnGuestDisplayName ? { turnGuestDisplayName } : {}),
  };
}

export function persistTurnState(roomId: string, data: PersistedTurnState): void {
  if (typeof window === 'undefined' || !roomId.trim()) return;
  try {
    sessionStorage.setItem(turnStateStorageKey(roomId), JSON.stringify(data));
  } catch {
    /* noop */
  }
}

export type TurnStateParticipant = {
  clientId: string;
  authUserId?: string;
  displayName?: string;
  isGuest?: boolean;
};

/** 永続 clientId を在室 participants の現 clientId に解決 */
export function resolvePersistedTurnClientId(
  persisted: PersistedTurnState,
  participants: readonly TurnStateParticipant[],
): string {
  const stored = persisted.currentTurnClientId.trim();
  if (participants.some((p) => p.clientId === stored)) return stored;

  const authId = persisted.turnAuthUserId?.trim();
  if (authId) {
    const byAuth = participants.find((p) => p.authUserId === authId);
    if (byAuth) return byAuth.clientId;
  }

  const guestName = persisted.turnGuestDisplayName?.trim();
  if (guestName) {
    const byGuest = participants.find(
      (p) =>
        !p.authUserId &&
        (p.displayName ?? '').trim() === guestName &&
        buildJoinOrderIdentityKey({ isGuest: true, displayName: guestName }) != null,
    );
    if (byGuest) return byGuest.clientId;
  }

  return stored;
}
