/**
 * 管理画面向け: room_id から部屋の表示ラベルを解決する。
 * - 選曲時刻に開催中だった会タイトル（room_gatherings.title）を最優先
 * - 次に product スコープの room_lobby_message.display_title（mc → ma）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PRODUCT_MA, PRODUCT_MC, type ProductId } from '@/lib/product-mode';
import { normalizeRoomHistoryProduct } from '@/lib/room-history-product';
import { isMissingProductColumnError } from '@/lib/room-product-scope';

export type GatheringRowForAdminRoomLabel = {
  room_id: string;
  title: string;
  product: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
};

export type AdminRoomLabelMaps = {
  lobbyByRoomProduct: Map<string, string>;
  gatherings: GatheringRowForAdminRoomLabel[];
};

type LobbyTitleRow = {
  room_id?: string;
  display_title?: string | null;
  product?: string | null;
};

type PgErr = { code?: string; message?: string };

export function lobbyMapKey(product: string, roomId: string): string {
  return `${product}:${roomId}`;
}

function normalizeProduct(raw: string | null | undefined): typeof PRODUCT_MA | typeof PRODUCT_MC {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === PRODUCT_MC) return PRODUCT_MC;
  if (v === PRODUCT_MA) return PRODUCT_MA;
  return PRODUCT_MA;
}

/** 選曲時刻に該当する会（複数 product あり得る）。最も新しく開始した会を採用。 */
export function findGatheringAtPlayedAt(
  gatherings: GatheringRowForAdminRoomLabel[],
  roomId: string,
  playedAt: string,
  product?: ProductId | null,
): GatheringRowForAdminRoomLabel | null {
  const rid = roomId.trim();
  const playedMs = Date.parse(playedAt);
  if (!rid || Number.isNaN(playedMs)) return null;

  const matches = gatherings.filter((g) => {
    if ((g.room_id ?? '').trim() !== rid) return false;
    if (product) {
      if (normalizeProduct(g.product) !== product) return false;
    }
    const startMs = g.started_at ? Date.parse(g.started_at) : NaN;
    if (Number.isNaN(startMs) || playedMs < startMs) return false;
    if (g.ended_at) {
      const endMs = Date.parse(g.ended_at);
      if (!Number.isNaN(endMs) && playedMs > endMs) return false;
    }
    return true;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const aStart = a.started_at ? Date.parse(a.started_at) : 0;
    const bStart = b.started_at ? Date.parse(b.started_at) : 0;
    return bStart - aStart;
  });
  return matches[0] ?? null;
}

export function resolveAdminRoomDisplayTitle(
  maps: AdminRoomLabelMaps,
  roomId: string,
  playedAt?: string | null,
  product?: string | null,
): string {
  const rid = roomId.trim();
  if (!rid) return '';

  const scopedProduct = product ? normalizeRoomHistoryProduct(product) : null;

  if (playedAt) {
    const gathering = findGatheringAtPlayedAt(
      maps.gatherings,
      rid,
      playedAt,
      scopedProduct ?? undefined,
    );
    const gt = (gathering?.title ?? '').trim();
    if (gt) return gt;
  }

  if (scopedProduct) {
    const lobby = maps.lobbyByRoomProduct.get(lobbyMapKey(scopedProduct, rid))?.trim();
    if (lobby) return lobby;
  }

  for (const p of [PRODUCT_MC, PRODUCT_MA] as const) {
    const lobby = maps.lobbyByRoomProduct.get(lobbyMapKey(p, rid))?.trim();
    if (lobby) return lobby;
  }

  return rid;
}

/** 会タイトルとロビー名が異なるときの補足（管理 UI 用・任意） */
export function resolveAdminRoomLobbySubtitle(
  maps: AdminRoomLabelMaps,
  roomId: string,
  primaryTitle: string,
): string | null {
  const rid = roomId.trim();
  const primary = primaryTitle.trim();
  if (!rid || !primary) return null;

  for (const product of [PRODUCT_MC, PRODUCT_MA] as const) {
    const lobby = maps.lobbyByRoomProduct.get(lobbyMapKey(product, rid))?.trim();
    if (lobby && lobby !== primary) {
      return `ロビー名: ${lobby}（${product === PRODUCT_MC ? 'mc' : 'ma'}）`;
    }
  }
  return null;
}

async function loadLobbyTitles(
  admin: SupabaseClient,
  roomIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (roomIds.length === 0) return out;

  const chunkSize = 120;
  for (let i = 0; i < roomIds.length; i += chunkSize) {
    const chunk = roomIds.slice(i, i + chunkSize);
    let data: LobbyTitleRow[] | null = null;
    let error: PgErr | null = null;

    const withProduct = await admin
      .from('room_lobby_message')
      .select('room_id, display_title, product')
      .in('room_id', chunk);
    data = (withProduct.data ?? null) as LobbyTitleRow[] | null;
    error = withProduct.error as PgErr | null;

    if (error && (isMissingProductColumnError(error) || error.code === '42703')) {
      const fallback = await admin
        .from('room_lobby_message')
        .select('room_id, display_title')
        .in('room_id', chunk);
      data = (fallback.data ?? null) as LobbyTitleRow[] | null;
      error = fallback.error as PgErr | null;
    }

    if (error) {
      if (error.code === '42P01') return out;
      console.error('[admin-room-display-label] room_lobby_message', error);
      continue;
    }

    for (const row of data ?? []) {
      const rid = typeof row.room_id === 'string' ? row.room_id.trim() : '';
      if (!rid) continue;
      const title = typeof row.display_title === 'string' ? row.display_title.trim() : '';
      if (!title) continue;
      const product = normalizeProduct(row.product) ?? PRODUCT_MA;
      const key = lobbyMapKey(product, rid);
      if (!out.has(key)) out.set(key, title);
    }
  }

  return out;
}

async function loadGatheringsOverlappingRange(
  admin: SupabaseClient,
  roomIds: string[],
  fromIso: string,
  toIso: string,
): Promise<GatheringRowForAdminRoomLabel[]> {
  const out: GatheringRowForAdminRoomLabel[] = [];
  if (roomIds.length === 0) return out;

  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return out;

  const chunkSize = 80;
  for (let i = 0; i < roomIds.length; i += chunkSize) {
    const chunk = roomIds.slice(i, i + chunkSize);
    let rows: GatheringRowForAdminRoomLabel[] = [];
    let error: PgErr | null = null;

    const withProduct = await admin
      .from('room_gatherings')
      .select('room_id, title, product, started_at, ended_at, status')
      .in('room_id', chunk)
      .lte('started_at', toIso)
      .order('started_at', { ascending: false })
      .limit(500);
    rows = ((withProduct.data ?? []) as GatheringRowForAdminRoomLabel[]) ?? [];
    error = withProduct.error as PgErr | null;

    if (error && (isMissingProductColumnError(error) || error.code === '42703')) {
      const fallback = await admin
        .from('room_gatherings')
        .select('room_id, title, started_at, ended_at, status')
        .in('room_id', chunk)
        .lte('started_at', toIso)
        .order('started_at', { ascending: false })
        .limit(500);
      rows = ((fallback.data ?? []) as GatheringRowForAdminRoomLabel[]).map((r) => ({
        ...r,
        product: PRODUCT_MA,
      }));
      error = fallback.error as PgErr | null;
    }

    if (error) {
      if (error.code === '42P01') return out;
      console.error('[admin-room-display-label] room_gatherings', error);
      continue;
    }

    for (const g of rows) {
      const startMs = g.started_at ? Date.parse(g.started_at) : NaN;
      if (Number.isNaN(startMs) || startMs > toMs) continue;
      const endMs = g.ended_at ? Date.parse(g.ended_at) : Number.POSITIVE_INFINITY;
      if (endMs < fromMs) continue;
      out.push(g);
    }
  }

  return out;
}

export async function loadAdminRoomLabelMaps(
  admin: SupabaseClient,
  roomIds: string[],
  timeRange?: { fromIso: string; toIso: string },
): Promise<AdminRoomLabelMaps> {
  const uniqueRoomIds = [...new Set(roomIds.map((id) => id.trim()).filter(Boolean))];
  const lobbyByRoomProduct = await loadLobbyTitles(admin, uniqueRoomIds);
  const gatherings =
    timeRange != null
      ? await loadGatheringsOverlappingRange(
          admin,
          uniqueRoomIds,
          timeRange.fromIso,
          timeRange.toIso,
        )
      : [];
  return { lobbyByRoomProduct, gatherings };
}
