/**
 * マイページ「参加履歴」の 12 時間スロット集計（06–18 / 18–06）
 */

export type ParticipationHistoryRow = {
  id: string;
  room_id: string;
  gathering_id: string | null;
  gathering_title: string | null;
  display_name: string | null;
  joined_at: string;
  left_at: string | null;
};

export type ParticipationSummaryRow = {
  slotStartMs: number;
  slotEndMs: number;
  slotLabel: string;
  room_id: string;
  gathering_title: string | null;
  display_name: string | null;
  first_joined_ms: number;
  last_left_ms: number | null;
  hasOpenSession: boolean;
  total_stay_ms: number;
};

export function participationSlotStartMs(t: Date): number {
  const y = t.getFullYear();
  const m = t.getMonth();
  const d = t.getDate();
  const h = t.getHours();
  if (h >= 6 && h < 18) return new Date(y, m, d, 6, 0, 0, 0).getTime();
  if (h >= 18) return new Date(y, m, d, 18, 0, 0, 0).getTime();
  return new Date(y, m, d - 1, 18, 0, 0, 0).getTime();
}

export function formatParticipationSlotLabel(startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const y = s.getFullYear();
  const m = String(s.getMonth() + 1).padStart(2, '0');
  const d = String(s.getDate()).padStart(2, '0');
  const sh = String(s.getHours()).padStart(2, '0');
  const eh = String(e.getHours()).padStart(2, '0');
  if (s.getHours() === 18) {
    const ny = e.getFullYear();
    const nm = String(e.getMonth() + 1).padStart(2, '0');
    const nd = String(e.getDate()).padStart(2, '0');
    return `${y}/${m}/${d} ${sh}:00 - ${ny}/${nm}/${nd} ${eh}:00`;
  }
  return `${y}/${m}/${d} ${sh}:00 - ${eh}:00`;
}

export function participationSummaryKey(row: Pick<ParticipationSummaryRow, 'slotStartMs' | 'room_id'>): string {
  return `${row.slotStartMs}::${row.room_id}`;
}

export function buildParticipationSummaryRows(
  participationHistory: ParticipationHistoryRow[],
  nowMs: number = Date.now(),
): ParticipationSummaryRow[] {
  if (participationHistory.length === 0) return [];
  const merged = new Map<string, ParticipationSummaryRow>();

  for (const row of participationHistory) {
    const joinedMs = new Date(row.joined_at).getTime();
    if (!Number.isFinite(joinedMs)) continue;
    const rawLeftMs = row.left_at ? new Date(row.left_at).getTime() : nowMs;
    const leftMs = Number.isFinite(rawLeftMs) ? Math.max(joinedMs, rawLeftMs) : joinedMs;
    let cursor = joinedMs;
    while (cursor < leftMs) {
      const slotStartMs = participationSlotStartMs(new Date(cursor));
      const slotEndMs = slotStartMs + 12 * 60 * 60 * 1000;
      const segStart = Math.max(cursor, slotStartMs);
      const segEnd = Math.min(leftMs, slotEndMs);
      if (segEnd > segStart) {
        const roomKey = row.room_id || '—';
        const key = `${slotStartMs}::${roomKey}`;
        const prev = merged.get(key);
        const openInsideSlot = !row.left_at || new Date(row.left_at).getTime() > slotEndMs;
        if (!prev) {
          merged.set(key, {
            slotStartMs,
            slotEndMs,
            slotLabel: formatParticipationSlotLabel(slotStartMs, slotEndMs),
            room_id: roomKey,
            gathering_title: row.gathering_title,
            display_name: row.display_name,
            first_joined_ms: segStart,
            last_left_ms: openInsideSlot ? null : segEnd,
            hasOpenSession: openInsideSlot,
            total_stay_ms: segEnd - segStart,
          });
        } else {
          prev.first_joined_ms = Math.min(prev.first_joined_ms, segStart);
          prev.total_stay_ms += segEnd - segStart;
          if (openInsideSlot) {
            prev.hasOpenSession = true;
            prev.last_left_ms = null;
          } else if (!prev.hasOpenSession) {
            prev.last_left_ms = Math.max(prev.last_left_ms ?? 0, segEnd);
          }
        }
      }
      cursor = slotEndMs;
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (b.slotStartMs !== a.slotStartMs) return b.slotStartMs - a.slotStartMs;
    return b.first_joined_ms - a.first_joined_ms;
  });
}
