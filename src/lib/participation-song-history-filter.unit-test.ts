import { filterSongHistoryForParticipationSlot } from './participation-song-history-filter';

const slot = {
  room_id: '02',
  slotStartMs: new Date('2026-06-29T06:00:00+09:00').getTime(),
  slotEndMs: new Date('2026-06-29T18:00:00+09:00').getTime(),
  first_joined_ms: new Date('2026-06-29T09:15:22+09:00').getTime(),
  last_left_ms: new Date('2026-06-29T11:40:42+09:00').getTime(),
  hasOpenSession: false,
};

const songs = [
  { id: '1', room_id: '02', posted_at: '2026-06-29T02:30:00+09:00' },
  { id: '2', room_id: '02', posted_at: '2026-06-29T10:00:00+09:00' },
  { id: '3', room_id: '03', posted_at: '2026-06-29T10:00:00+09:00' },
  { id: '4', room_id: '02', posted_at: '2026-06-29T11:30:00+09:00' },
];

const filtered = filterSongHistoryForParticipationSlot(songs, slot);
const ok =
  filtered.length === 2 &&
  filtered.every((r) => r.id === '2' || r.id === '4') &&
  filterSongHistoryForParticipationSlot([], slot).length === 0;

if (!ok) {
  console.error('participation-song-history-filter unit tests: FAILED', filtered);
  process.exit(1);
}
console.log('participation-song-history-filter unit tests: OK');
