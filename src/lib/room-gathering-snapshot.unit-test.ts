import { gatheringDurationMs } from './room-gathering-snapshot';

const ok =
  gatheringDurationMs('2026-06-29T10:00:00.000Z', '2026-06-29T12:30:00.000Z') === 9_000_000 &&
  gatheringDurationMs('2026-06-29T12:00:00.000Z', '2026-06-29T10:00:00.000Z') === null &&
  gatheringDurationMs(null, '2026-06-29T10:00:00.000Z') === null;

if (!ok) {
  console.error('room-gathering-snapshot unit tests: FAILED');
  process.exit(1);
}
console.log('room-gathering-snapshot unit tests: OK');
