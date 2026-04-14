/**
 * 曲紹介 comment-pack の表示スロット（1=基本情報 2=ヒット・受賞 3=歌詞 4=サウンド）
 */

export type CommentPackSlotSelection = readonly [boolean, boolean, boolean, boolean];

/** 従来の「基本1本」のみ相当 */
export const DEFAULT_COMMENT_PACK_SLOTS: CommentPackSlotSelection = [true, false, false, false];

/** 参照ではなく4要素の値だけ比較（Ably エコーで毎回新配列が来るための安定化に使う） */
export function commentPackSlotsEqual(a: CommentPackSlotSelection, b: CommentPackSlotSelection): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function isCommentPackFullyOff(s: CommentPackSlotSelection): boolean {
  return !s[0] && !s[1] && !s[2] && !s[3];
}

export function equivalentBaseOnlySlots(s: CommentPackSlotSelection): boolean {
  return s[0] && !s[1] && !s[2] && !s[3];
}

/** API リクエスト body から正規化（従来の mode 文字列も受け付ける） */
export function normalizeCommentPackSlotsFromRequestBody(body: unknown): CommentPackSlotSelection {
  const o = body as Record<string, unknown> | null;
  const legacy = o?.mode;
  if (legacy === 'off') return [false, false, false, false];
  if (legacy === 'full') return [true, true, true, true];
  if (legacy === 'base_only') return [true, false, false, false];
  const s = o?.slots;
  if (Array.isArray(s) && s.length === 4 && s.every((x) => typeof x === 'boolean')) {
    return [Boolean(s[0]), Boolean(s[1]), Boolean(s[2]), Boolean(s[3])];
  }
  return DEFAULT_COMMENT_PACK_SLOTS;
}

export function parseCommentPackSlotsFromStorageRaw(raw: string): CommentPackSlotSelection | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j) && j.length === 4 && j.every((x) => typeof x === 'boolean')) {
      return [Boolean(j[0]), Boolean(j[1]), Boolean(j[2]), Boolean(j[3])];
    }
  } catch {
    /* 旧形式: 単一文字列 */
  }
  if (t === 'full') return [true, true, true, true];
  if (t === 'base_only') return [true, false, false, false];
  if (t === 'off') return [false, false, false, false];
  return null;
}

export function serializeCommentPackSlots(s: CommentPackSlotSelection): string {
  return JSON.stringify([s[0], s[1], s[2], s[3]]);
}

export function isValidCommentPackSlotsPayload(slots: unknown): slots is CommentPackSlotSelection {
  return (
    Array.isArray(slots) &&
    slots.length === 4 &&
    slots.every((x) => typeof x === 'boolean')
  );
}

export function toggleCommentPackSlot(
  s: CommentPackSlotSelection,
  index: 0 | 1 | 2 | 3,
): CommentPackSlotSelection {
  const n = [s[0], s[1], s[2], s[3]] as boolean[];
  n[index] = !n[index];
  return [n[0], n[1], n[2], n[3]];
}

export const COMMENT_PACK_SLOTS_NONE: CommentPackSlotSelection = [false, false, false, false];
export const COMMENT_PACK_SLOTS_FULL: CommentPackSlotSelection = [true, true, true, true];

/** `packPhase=frees` 時に 0..2 の1枠だけ生成するクライアント用（並列リクエストで応答を早く返す） */
export function parseOptionalFreeSlotIndex(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const v = (body as Record<string, unknown>).freeSlotIndex;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 3) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    if (n >= 0 && n < 3) return n;
  }
  return null;
}

/** 既知パターンは共有定数に寄せ、React の不要な再レンダー・effect 連鎖を減らす */
export function canonicalCommentPackSlots(s: CommentPackSlotSelection): CommentPackSlotSelection {
  if (commentPackSlotsEqual(s, COMMENT_PACK_SLOTS_NONE)) return COMMENT_PACK_SLOTS_NONE;
  if (commentPackSlotsEqual(s, COMMENT_PACK_SLOTS_FULL)) return COMMENT_PACK_SLOTS_FULL;
  if (commentPackSlotsEqual(s, DEFAULT_COMMENT_PACK_SLOTS)) return DEFAULT_COMMENT_PACK_SLOTS;
  return [s[0], s[1], s[2], s[3]];
}
