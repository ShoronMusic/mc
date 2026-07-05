/**
 * 入室順（joinedAtMs）を authUserId / ゲスト表示名で sessionStorage に短期保持。
 * Ably 再接続で clientId が変わっても、同一ブラウザ・同一参加者の並びを維持する。
 */

import { SELECTION_ROUND_SESSION_MAX_GAP_MS } from '@/lib/room-selection-round';

const STORAGE_PREFIX = 'mc_room_joined_at:v1:';

export function joinOrderStorageKey(roomId: string, identityKey: string): string {
  return `${STORAGE_PREFIX}${roomId.trim()}:${identityKey}`;
}

/** sessionStorage のキー用（auth UUID または guest:表示名） */
export function buildJoinOrderIdentityKey(params: {
  authUserId?: string | null;
  displayName?: string | null;
  isGuest?: boolean;
}): string | null {
  const aid = typeof params.authUserId === 'string' ? params.authUserId.trim() : '';
  if (aid && /^[0-9a-f-]{36}$/i.test(aid)) return `auth:${aid}`;
  if (params.isGuest) {
    const name = (params.displayName ?? '').trim();
    if (name && name !== 'ゲスト') return `guest:${name}`;
  }
  return null;
}

export interface PersistedJoinedAt {
  joinedAtMs: number;
  updatedAt: number;
}

export function readPersistedJoinedAtMs(
  roomId: string,
  identityKey: string,
  maxGapMs: number = SELECTION_ROUND_SESSION_MAX_GAP_MS,
): number | null {
  if (typeof window === 'undefined' || !roomId.trim() || !identityKey.trim()) return null;
  try {
    const raw = sessionStorage.getItem(joinOrderStorageKey(roomId, identityKey));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedJoinedAt>;
    if (
      typeof data.joinedAtMs !== 'number' ||
      !Number.isFinite(data.joinedAtMs) ||
      typeof data.updatedAt !== 'number' ||
      !Number.isFinite(data.updatedAt)
    ) {
      return null;
    }
    if (Date.now() - data.updatedAt > maxGapMs) return null;
    return Math.floor(data.joinedAtMs);
  } catch {
    return null;
  }
}

export function persistJoinedAtMs(roomId: string, identityKey: string, joinedAtMs: number): void {
  if (typeof window === 'undefined' || !roomId.trim() || !identityKey.trim()) return;
  if (!Number.isFinite(joinedAtMs)) return;
  try {
    const payload: PersistedJoinedAt = {
      joinedAtMs: Math.floor(joinedAtMs),
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(joinOrderStorageKey(roomId, identityKey), JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

/**
 * このブラウザの presence joinedAtMs。
 * 既存の永続値があれば再利用し、なければ now を保存する。
 */
export function resolveJoinedAtMsForSession(params: {
  roomId: string;
  authUserId?: string | null;
  displayName?: string | null;
  isGuest?: boolean;
  nowMs?: number;
}): number {
  const now = params.nowMs ?? Date.now();
  const identityKey = buildJoinOrderIdentityKey(params);
  if (!identityKey) return now;
  const persisted = readPersistedJoinedAtMs(params.roomId, identityKey);
  if (persisted != null) return persisted;
  persistJoinedAtMs(params.roomId, identityKey, now);
  return now;
}

/** presence 行の sortKey（永続 joinedAtMs を auth / guest 名で優先） */
export function sortKeyForPresenceMember(params: {
  roomId: string;
  clientId: string;
  joinedAtMs?: number;
  authUserId?: string | null;
  displayName?: string | null;
  isGuest?: boolean;
  fallbackTimestamp?: number;
}): number {
  const identityKey = buildJoinOrderIdentityKey({
    authUserId: params.authUserId,
    displayName: params.displayName,
    isGuest: params.isGuest ?? !params.authUserId,
  });
  const fromPresence =
    typeof params.joinedAtMs === 'number' && Number.isFinite(params.joinedAtMs)
      ? params.joinedAtMs
      : null;
  if (identityKey) {
    const persisted = readPersistedJoinedAtMs(params.roomId, identityKey);
    if (persisted != null) {
      if (fromPresence != null && fromPresence < persisted) {
        persistJoinedAtMs(params.roomId, identityKey, fromPresence);
        return fromPresence;
      }
      return persisted;
    }
    if (fromPresence != null) {
      persistJoinedAtMs(params.roomId, identityKey, fromPresence);
      return fromPresence;
    }
  }
  if (fromPresence != null) return fromPresence;
  const fb = params.fallbackTimestamp;
  if (typeof fb === 'number' && Number.isFinite(fb)) return fb;
  return 0;
}

/** チャットオーナーを左端（[1]）にし、それ以降は元の入室順を維持 */
export function orderParticipantsWithOwnerFirst<T extends { clientId: string }>(
  rows: readonly T[],
  ownerClientId: string | null | undefined,
): T[] {
  const owner = (ownerClientId ?? '').trim();
  if (!owner || rows.length <= 1) return [...rows];
  const idx = rows.findIndex((r) => r.clientId === owner);
  if (idx <= 0) return [...rows];
  return [...rows.slice(idx), ...rows.slice(0, idx)];
}
