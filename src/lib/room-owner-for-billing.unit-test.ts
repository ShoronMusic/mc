import {
  attributeYoutubeLogToOwner,
  loadGatheringsForBillingWindow,
  type GatheringOwnerRow,
} from './room-owner-for-billing';

const gatherings: GatheringOwnerRow[] = [
  {
    room_id: '02',
    created_by: 'owner-a',
    started_at: '2026-06-29T06:00:00+09:00',
    ended_at: null,
    status: 'live',
  },
  {
    room_id: '03',
    created_by: 'owner-b',
    started_at: '2026-06-28T06:00:00+09:00',
    ended_at: '2026-06-28T20:00:00+09:00',
    status: 'ended',
  },
];

const ok =
  attributeYoutubeLogToOwner(gatherings, '02', '2026-06-29T10:00:00+09:00') === 'owner-a' &&
  attributeYoutubeLogToOwner(gatherings, '03', '2026-06-28T12:00:00+09:00') === 'owner-b' &&
  attributeYoutubeLogToOwner(gatherings, '03', '2026-06-29T10:00:00+09:00') === 'owner-b' &&
  attributeYoutubeLogToOwner(gatherings, '99', '2026-06-29T10:00:00+09:00') === null;

if (!ok) {
  console.error('room-owner-for-billing unit tests: FAILED');
  process.exit(1);
}
console.log('room-owner-for-billing unit tests: OK');
