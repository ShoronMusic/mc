/** 部屋視聴履歴 GET の1ページあたり件数（初期表示・追加取得とも） */
export const ROOM_PLAYBACK_HISTORY_PAGE_SIZE = 100;

const MAX_OFFSET = 50_000;

export function parseRoomPlaybackHistoryLimit(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return ROOM_PLAYBACK_HISTORY_PAGE_SIZE;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return ROOM_PLAYBACK_HISTORY_PAGE_SIZE;
  return Math.min(n, ROOM_PLAYBACK_HISTORY_PAGE_SIZE);
}

export function parseRoomPlaybackHistoryOffset(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_OFFSET);
}

export function appendRoomPlaybackHistoryPagination(
  qs: URLSearchParams,
  opts?: { limit?: number; offset?: number },
): void {
  qs.set('limit', String(opts?.limit ?? ROOM_PLAYBACK_HISTORY_PAGE_SIZE));
  qs.set('offset', String(opts?.offset ?? 0));
}
