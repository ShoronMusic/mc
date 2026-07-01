/**
 * 参加履歴スロットに対応する user_song_history 行を絞り込む
 */

import type { ParticipationSummaryRow } from '@/lib/participation-summary';

export type ParticipationSongHistoryItem = {
  room_id: string;
  posted_at: string;
};

export function filterSongHistoryForParticipationSlot<T extends ParticipationSongHistoryItem>(
  songs: T[],
  slot: Pick<
    ParticipationSummaryRow,
    'room_id' | 'slotStartMs' | 'slotEndMs' | 'first_joined_ms' | 'last_left_ms' | 'hasOpenSession'
  >,
  nowMs: number = Date.now(),
): T[] {
  const roomId = slot.room_id.trim();
  if (!roomId) return [];

  const stayEndMs = slot.last_left_ms ?? (slot.hasOpenSession ? nowMs : slot.slotEndMs);
  const windowStartMs = Math.max(slot.first_joined_ms, slot.slotStartMs);
  const windowEndMs = Math.min(stayEndMs, slot.slotEndMs);
  if (windowEndMs < windowStartMs) return [];

  return songs.filter((row) => {
    if ((row.room_id ?? '').trim() !== roomId) return false;
    const postedMs = new Date(row.posted_at).getTime();
    if (!Number.isFinite(postedMs)) return false;
    return postedMs >= windowStartMs && postedMs <= windowEndMs;
  });
}
