/**
 * 部屋モニタリング用 12 時間スロット（06–18 / 18–06）
 * マイページ参加履歴と同じ境界（participation-summary と整合）
 */

import {
  formatParticipationSlotLabel,
  participationSlotStartMs,
  participationSummaryKey,
} from '@/lib/participation-summary';

export const DAILY_SLOT_DURATION_MS = 12 * 60 * 60 * 1000;

export function dailySlotStartMs(date: Date): number {
  return participationSlotStartMs(date);
}

export function dailySlotEndMs(slotStartMs: number): number {
  return slotStartMs + DAILY_SLOT_DURATION_MS;
}

export function formatDailySlotLabel(slotStartMs: number): string {
  return formatParticipationSlotLabel(slotStartMs, dailySlotEndMs(slotStartMs));
}

export function dailySlotKey(roomId: string, slotStartMs: number): string {
  return participationSummaryKey({ slotStartMs, room_id: roomId.trim() || '—' });
}

export function parseDailySlotKey(key: string): { slotStartMs: number; roomId: string } | null {
  const idx = key.indexOf('::');
  if (idx <= 0) return null;
  const slotStartMs = Number(key.slice(0, idx));
  const roomId = key.slice(idx + 2).trim();
  if (!Number.isFinite(slotStartMs) || !roomId) return null;
  return { slotStartMs, roomId };
}

/** [fromMs, toMs] と重なるスロット開始時刻（昇順） */
export function enumerateDailySlotStarts(fromMs: number, toMs: number): number[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
  const out: number[] = [];
  let cursor = dailySlotStartMs(new Date(fromMs));
  const last = toMs + DAILY_SLOT_DURATION_MS;
  while (cursor <= last) {
    const slotEnd = cursor + DAILY_SLOT_DURATION_MS;
    if (slotEnd > fromMs && cursor <= toMs) {
      out.push(cursor);
    }
    cursor += DAILY_SLOT_DURATION_MS;
  }
  return out;
}

export function isDailySlotComplete(slotStartMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= slotStartMs + DAILY_SLOT_DURATION_MS;
}

export function isoInDailySlot(iso: string, slotStartMs: number): boolean {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms >= slotStartMs && ms < slotStartMs + DAILY_SLOT_DURATION_MS;
}
