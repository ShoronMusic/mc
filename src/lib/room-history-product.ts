/**
 * room_playback_history / room_access_log / room_chat_log の ma / mc 分離。
 * @see docs/supabase-room-history-product-column.md
 * @see docs/supabase-room-chat-log-product-column.md
 */

import {
  getProductId,
  PRODUCT_MA,
  PRODUCT_MC,
  type ProductId,
} from '@/lib/product-mode';
import { isMissingProductColumnError } from '@/lib/room-product-scope';

export { PRODUCT_MA, PRODUCT_MC, type ProductId };

export type AdminProductFilter = 'all' | ProductId;

export function getRoomHistoryProductId(): ProductId {
  return getProductId();
}

export function normalizeRoomHistoryProduct(raw: unknown): ProductId {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === PRODUCT_MC) return PRODUCT_MC;
  return PRODUCT_MA;
}

export function productShortLabel(product: ProductId): 'ma' | 'mc' {
  return product === PRODUCT_MC ? 'mc' : 'ma';
}

/** 管理 API `?product=` — 未指定・all は全件 */
export function parseAdminProductFilter(raw: string | null | undefined): AdminProductFilter {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'all' || v === 'both' || v === '') return 'all';
  if (v === PRODUCT_MC || v === 'mc' || v === 'musicchat') return PRODUCT_MC;
  if (v === PRODUCT_MA || v === 'ma' || v === 'musicaichat') return PRODUCT_MA;
  return 'all';
}

export function withRoomHistoryProductEq<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  product: ProductId = getRoomHistoryProductId(),
): T {
  return query.eq('product', product);
}

type PostgrestLikeError = { code?: string | null; message?: string | null } | null;

type ScopedQueryResult<T = unknown[]> = { data: T | null; error: PostgrestLikeError };

/** product 列未作成 DB では product なしで再試行 */
export async function runRoomHistoryQueryScoped<T = unknown[]>(
  build: (scopeProduct: boolean) => PromiseLike<ScopedQueryResult<T>>,
): Promise<ScopedQueryResult<T>> {
  let res = await build(true);
  if (res.error && isMissingProductColumnError(res.error)) {
    res = await build(false);
  }
  return res;
}

/** 管理走査用: product フィルタ付き eq（列なしならフィルタなし） */
export async function runAdminHistoryQueryScoped<T = unknown[]>(
  build: (applyProductEq: boolean, product: ProductId | null) => PromiseLike<ScopedQueryResult<T>>,
  productFilter: AdminProductFilter,
): Promise<ScopedQueryResult<T>> {
  const scopedProduct = productFilter === 'all' ? null : productFilter;
  let res = await build(scopedProduct != null, scopedProduct);
  if (res.error && isMissingProductColumnError(res.error)) {
    res = await build(false, null);
  }
  return res;
}

export function buildRoomAccessLogDedupeKey(opts: {
  product: ProductId;
  roomId: string;
  ymd: string;
  sessionUserId?: string | null;
  visitorKey?: string | null;
}): string {
  const product = normalizeRoomHistoryProduct(opts.product);
  const roomId = opts.roomId.trim();
  const ymd = opts.ymd.trim();
  if (opts.sessionUserId) {
    return `${product}|${roomId}|u:${opts.sessionUserId.trim()}|${ymd}`;
  }
  const vk = (opts.visitorKey ?? '').trim().toLowerCase();
  return `${product}|${roomId}|g:${vk}|${ymd}`;
}

/** 旧 dedupe_key（product 列追加前）— 23505 時の再試行用 */
export function buildLegacyRoomAccessLogDedupeKey(opts: {
  roomId: string;
  ymd: string;
  sessionUserId?: string | null;
  visitorKey?: string | null;
}): string {
  const roomId = opts.roomId.trim();
  const ymd = opts.ymd.trim();
  if (opts.sessionUserId) {
    return `${roomId}|u:${opts.sessionUserId.trim()}|${ymd}`;
  }
  const vk = (opts.visitorKey ?? '').trim().toLowerCase();
  return `${roomId}|g:${vk}|${ymd}`;
}
