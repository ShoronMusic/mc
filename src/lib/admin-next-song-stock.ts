import { jstYmdFromIso } from '@/lib/admin-song-lookup';
import { normalizeNextSongPickMatchKey } from '@/lib/next-song-recommend-store';
import type { NextSongPickCatalogHit } from '@/lib/next-song-recommend-catalog-resolve';

export type AdminNextSongStockRow = {
  id: string;
  seed_song_id: string | null;
  seed_video_id: string;
  seed_label: string;
  recommended_artist: string;
  recommended_title: string;
  reason: string;
  youtube_search_query: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  feedback?: { good: number; bad: number; commentCount: number };
  catalog: NextSongPickCatalogHit | null;
};

export type AdminNextSongStockDay = {
  dateJst: string;
  rows: AdminNextSongStockRow[];
};

export type AdminNextSongStockSeedGroup = {
  seedVideoId: string;
  seedSongId: string | null;
  seedLabel: string;
  latestCreatedAt: string;
  days: AdminNextSongStockDay[];
  rowCount: number;
};

function timeOf(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function groupAdminNextSongStockRows(
  rows: readonly AdminNextSongStockRow[],
): AdminNextSongStockSeedGroup[] {
  const bySeed = new Map<string, AdminNextSongStockRow[]>();
  for (const row of rows) {
    if (row.is_active === false) continue;
    const seedKey = row.seed_video_id.trim() || `missing:${row.seed_label.trim()}`;
    const current = bySeed.get(seedKey) ?? [];
    current.push(row);
    bySeed.set(seedKey, current);
  }

  return [...bySeed.entries()]
    .map(([seedVideoId, seedRows]) => {
      const sortedRows = [...seedRows].sort((a, b) => {
        const dateDiff = timeOf(b.created_at) - timeOf(a.created_at);
        return dateDiff || a.order_index - b.order_index;
      });
      const byDay = new Map<string, AdminNextSongStockRow[]>();
      for (const row of sortedRows) {
        const day = jstYmdFromIso(row.created_at);
        const current = byDay.get(day) ?? [];
        current.push(row);
        byDay.set(day, current);
      }
      const first = sortedRows[0]!;
      return {
        seedVideoId,
        seedSongId: first.seed_song_id,
        seedLabel: first.seed_label,
        latestCreatedAt: first.created_at,
        days: [...byDay.entries()].map(([dateJst, dayRows]) => ({
          dateJst,
          rows: dayRows,
        })),
        rowCount: sortedRows.length,
      };
    })
    .sort((a, b) => timeOf(b.latestCreatedAt) - timeOf(a.latestCreatedAt));
}

export type AdminNextSongStockSummary = {
  seedCount: number;
  recommendationCount: number;
  uniqueRecommendationCount: number;
  libraryTodoCount: number;
  music8TodoCount: number;
};

export function summarizeAdminNextSongStockRows(
  rows: readonly AdminNextSongStockRow[],
): AdminNextSongStockSummary {
  const active = rows.filter((row) => row.is_active !== false);
  const seeds = new Set<string>();
  const uniquePicks = new Map<string, AdminNextSongStockRow>();
  for (const row of active) {
    seeds.add(row.seed_video_id.trim() || `missing:${row.seed_label.trim()}`);
    const key = normalizeNextSongPickMatchKey(
      row.recommended_artist,
      row.recommended_title,
    );
    if (!uniquePicks.has(key)) uniquePicks.set(key, row);
  }
  const uniqueRows = [...uniquePicks.values()];
  return {
    seedCount: seeds.size,
    recommendationCount: active.length,
    uniqueRecommendationCount: uniqueRows.length,
    libraryTodoCount: uniqueRows.filter((row) => !row.catalog?.inMcDb).length,
    music8TodoCount: uniqueRows.filter((row) => !row.catalog?.inMusic8).length,
  };
}
