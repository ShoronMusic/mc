/**
 * ma / mc で部屋・集会・Ably を分離（案2）。
 * @see docs/00-music-chat-product-plan.md §3.2
 * @see docs/supabase-room-gatherings-product-column.md
 */
import { getProductId, isMcProduct, PRODUCT_MA, PRODUCT_MC, type ProductId } from '@/lib/product-mode';

export { PRODUCT_MA, PRODUCT_MC, type ProductId };

/** DB `room_gatherings.product` / Ably 接頭辞と同じ値 */
export function getGatheringProductId(): ProductId {
  return getProductId();
}

/** Ably チャンネル名（例: musicaichat:room:02 / musicchat:room:09） */
export function getAblyRoomChannelName(roomId: string): string {
  const rid = roomId.trim();
  return `${getGatheringProductId()}:room:${rid}`;
}

/** レガシー `room:02`（移行前のクライアントが残っている場合の参照用） */
export function getLegacyAblyRoomChannelName(roomId: string): string {
  return `room:${roomId.trim()}`;
}

export function isMissingProductColumnError(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const msg = error.message ?? '';
  return msg.includes('product') && (msg.includes('column') || msg.includes('does not exist'));
}

export function gatheringProductLabel(): string {
  return isMcProduct() ? 'Music Chat' : 'Music AI Chat';
}

/** Supabase クエリに product 条件を付与（列未作成 DB では呼び出し側がフォールバック） */
export function withGatheringProductEq<T extends { eq: (column: string, value: string) => T }>(
  query: T,
): T {
  return query.eq('product', getGatheringProductId());
}

export function withLobbyProductEq<T extends { eq: (column: string, value: string) => T }>(
  query: T,
): T {
  return withGatheringProductEq(query);
}

type PostgrestLikeError = { code?: string | null; message?: string | null } | null;

type ScopedQueryResult = { data: unknown; error: PostgrestLikeError };

/** product 列が無い DB では product なしで再試行（ma 後方互換） */
export async function runGatheringQueryScoped(
  build: (scopeProduct: boolean) => PromiseLike<ScopedQueryResult>,
): Promise<ScopedQueryResult> {
  let res = await build(true);
  if (res.error && isMissingProductColumnError(res.error)) {
    res = await build(false);
  }
  return res;
}

export async function runLobbyQueryScoped(
  build: (scopeProduct: boolean) => PromiseLike<ScopedQueryResult>,
): Promise<ScopedQueryResult> {
  return runGatheringQueryScoped(build);
}

/**
 * セッション奪取・入室復元など、room 関連の localStorage / sessionStorage キーに product を含める。
 * 例: `mc:last_room_enter_v1:musicaichat` / `mc:room_session_claim:musicchat:02`
 */
export function getRoomProductScopedStorageKey(baseKey: string, roomId?: string): string {
  const base = baseKey.trim();
  const product = getGatheringProductId();
  const rid = roomId?.trim();
  if (!base) return product;
  if (rid) return `${base}${product}:${rid}`;
  return `${base}${product}`;
}
