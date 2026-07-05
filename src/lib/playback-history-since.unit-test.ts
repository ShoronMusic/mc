import {
  maxIsoTimestamp,
  parseIsoTimestamp,
  resolvePlaybackHistorySinceIso,
} from '@/lib/playback-history-since';

const t0 = '2026-01-01T00:00:00.000Z';
const t1 = '2026-06-01T12:00:00.000Z';

console.assert(parseIsoTimestamp(t0) === new Date(t0).getTime(), 'parseIsoTimestamp valid');
console.assert(parseIsoTimestamp('') === null, 'parseIsoTimestamp empty');
console.assert(parseIsoTimestamp('not-a-date') === null, 'parseIsoTimestamp invalid');

console.assert(
  resolvePlaybackHistorySinceIso({
    isGuest: false,
    roomHasRegisteredParticipant: true,
    sessionEnteredAtMs: Date.now(),
    gatheringStartedAtIso: t1,
  }) === t1,
  'logged-in user uses gathering since',
);

console.assert(
  resolvePlaybackHistorySinceIso({
    isGuest: false,
    roomHasRegisteredParticipant: true,
    sessionEnteredAtMs: Date.now(),
    gatheringStartedAtIso: null,
  }) === undefined,
  'no gathering => no since',
);

const guestEnterMs = new Date('2026-06-02T00:00:00.000Z').getTime();
const guestResolved = resolvePlaybackHistorySinceIso({
  isGuest: true,
  roomHasRegisteredParticipant: false,
  sessionEnteredAtMs: guestEnterMs,
  gatheringStartedAtIso: t1,
});
console.assert(
  guestResolved === new Date(guestEnterMs).toISOString(),
  'guest solo uses later enter time when gathering started earlier',
);

console.assert(
  maxIsoTimestamp(t0, t1) === t1,
  'maxIsoTimestamp picks latest',
);

console.log('[playback-history-since.unit-test] ok');
