/**
 * 部屋オーナー・強制退出まわり
 * - 同一部屋用の安定した clientId（sessionStorage）
 * - 強制退出後の 3 時間入室禁止（localStorage）
 * - オーナー不在時は5分経過で「残っているメンバーのうち、現在の在室セッションで最も早く入室した人」に自動付与
 */

import {
  type CommentPackSlotSelection,
  parseCommentPackSlotsFromStorageRaw,
  serializeCommentPackSlots,
} from '@/lib/comment-pack-slots';

const ABLY_CID_PREFIX = 'mc:ably_cid:';
const KICKED_PREFIX = 'mc:kicked:';
const KICKED_DURATION_MS = 3 * 60 * 60 * 1000;
export const SITEWIDE_KICK_ROOM_ID = '__site__';
const SITEWIDE_KICK_KEY = 'mc:kicked:sitewide';
const GLOBAL_CLIENT_ID_KEY = 'mc:global_client_id';

/** オーナー退出後、同じ clientId が復帰できる猶予（5分）。過ぎたら最古在室メンバーに付与 */
export const OWNER_ABSENCE_MS = 5 * 60 * 1000;

const OWNER_STATE_PREFIX = 'mc:owner_state:';

export function getOwnerStateStorageKey(roomId: string): string {
  return `${OWNER_STATE_PREFIX}${roomId}`;
}

export interface OwnerState {
  ownerClientId: string;
  ownerLeftAt: number | null;
}

export function getOwnerStateFromStorage(roomId: string): OwnerState | null {
  if (typeof window === 'undefined' || !roomId) return null;
  try {
    const raw = localStorage.getItem(getOwnerStateStorageKey(roomId));
    if (!raw) return null;
    const o = JSON.parse(raw) as OwnerState;
    if (typeof o?.ownerClientId !== 'string') return null;
    return {
      ownerClientId: o.ownerClientId,
      ownerLeftAt: typeof o.ownerLeftAt === 'number' ? o.ownerLeftAt : null,
    };
  } catch {
    return null;
  }
}

export function setOwnerStateToStorage(roomId: string, state: OwnerState): void {
  if (typeof window === 'undefined' || !roomId) return;
  try {
    localStorage.setItem(getOwnerStateStorageKey(roomId), JSON.stringify(state));
  } catch {}
}

const COMMENT_PACK_MODE_PREFIX = 'mc:room_comment_pack:';

export function getCommentPackModeStorageKey(roomId: string): string {
  return `${COMMENT_PACK_MODE_PREFIX}${roomId}`;
}

/** 曲紹介コメントのスロット選択。退室後も同一ブラウザ・同一部屋で復元する */
export function getCommentPackSlotsFromStorage(roomId: string): CommentPackSlotSelection | null {
  if (typeof window === 'undefined' || !roomId) return null;
  try {
    const raw = localStorage.getItem(getCommentPackModeStorageKey(roomId));
    if (!raw) return null;
    return parseCommentPackSlotsFromStorageRaw(raw);
  } catch {
    return null;
  }
}

export function setCommentPackSlotsToStorage(roomId: string, slots: CommentPackSlotSelection): void {
  if (typeof window === 'undefined' || !roomId) return;
  try {
    localStorage.setItem(getCommentPackModeStorageKey(roomId), serializeCommentPackSlots(slots));
  } catch {}
}

/** @deprecated 互換用エイリアス */
export function getCommentPackModeFromStorage(roomId: string): CommentPackSlotSelection | null {
  return getCommentPackSlotsFromStorage(roomId);
}

export function setCommentPackModeToStorage(roomId: string, slots: CommentPackSlotSelection): void {
  setCommentPackSlotsToStorage(roomId, slots);
}

export function getRoomClientIdStorageKey(roomId: string): string {
  return `${ABLY_CID_PREFIX}${roomId}`;
}

/** この部屋用の clientId を取得または生成（sessionStorage） */
export function getOrCreateRoomClientId(roomId: string): string {
  if (typeof window === 'undefined') return '';
  const key = getRoomClientIdStorageKey(roomId);
  try {
    let c = sessionStorage.getItem(key);
    if (!c || !c.trim()) {
      c = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `g-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      sessionStorage.setItem(key, c);
    }
    return c;
  } catch {
    return `g-${Date.now()}`;
  }
}

export function getKickedStorageKey(roomId: string): string {
  return `${KICKED_PREFIX}${roomId}`;
}

export interface KickedRecord {
  clientId: string;
  expiresAt: number;
}

/** 強制退出を記録（3時間入室禁止） */
export function setKicked(roomId: string, clientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getKickedStorageKey(roomId);
    const value: KickedRecord = {
      clientId,
      expiresAt: Date.now() + KICKED_DURATION_MS,
    };
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** 現在の clientId がこの部屋でキック済みかつ期限内か */
export function isKickedForRoom(roomId: string, clientId: string): boolean {
  if (typeof window === 'undefined' || !roomId || !clientId) return false;
  try {
    const raw = localStorage.getItem(getKickedStorageKey(roomId));
    if (!raw) return false;
    const record: KickedRecord = JSON.parse(raw);
    return record.clientId === clientId && Date.now() < record.expiresAt;
  } catch {
    return false;
  }
}

function getOrCreateGlobalClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(GLOBAL_CLIENT_ID_KEY);
    if (!id || !id.trim()) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `u-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(GLOBAL_CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function setKickedSitewide(): void {
  if (typeof window === 'undefined') return;
  try {
    const globalId = getOrCreateGlobalClientId();
    if (!globalId) return;
    const value: KickedRecord = {
      clientId: globalId,
      expiresAt: Date.now() + KICKED_DURATION_MS,
    };
    localStorage.setItem(SITEWIDE_KICK_KEY, JSON.stringify(value));
  } catch {}
}

export function isKickedSitewide(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const globalId = getOrCreateGlobalClientId();
    if (!globalId) return false;
    const raw = localStorage.getItem(SITEWIDE_KICK_KEY);
    if (!raw) return false;
    const record: KickedRecord = JSON.parse(raw);
    return record.clientId === globalId && Date.now() < record.expiresAt;
  } catch {
    return false;
  }
}

const AI_Q_WARN_PREFIX = 'mc:aiq_warn:';

function getAiQuestionWarnStorageKey(roomId: string): string {
  return `${AI_Q_WARN_PREFIX}${roomId}`;
}

interface AiQuestionWarnRecord {
  clientId: string;
  count: number;
  updatedAt: number;
}

export function getAiQuestionWarnCount(roomId: string, clientId: string): number {
  if (typeof window === 'undefined' || !roomId || !clientId) return 0;
  try {
    const raw = localStorage.getItem(getAiQuestionWarnStorageKey(roomId));
    if (!raw) return 0;
    const rec = JSON.parse(raw) as AiQuestionWarnRecord;
    if (rec.clientId !== clientId) return 0;
    return Number.isFinite(rec.count) ? Math.max(0, Math.floor(rec.count)) : 0;
  } catch {
    return 0;
  }
}

export function incrementAiQuestionWarnCount(roomId: string, clientId: string): number {
  if (typeof window === 'undefined' || !roomId || !clientId) return 0;
  try {
    const next = getAiQuestionWarnCount(roomId, clientId) + 1;
    const rec: AiQuestionWarnRecord = {
      clientId,
      count: next,
      updatedAt: Date.now(),
    };
    localStorage.setItem(getAiQuestionWarnStorageKey(roomId), JSON.stringify(rec));
    return next;
  } catch {
    return 0;
  }
}
