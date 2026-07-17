import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSongReservationQueueApply,
  resolveQueueScanStartClientId,
  removePublisherReservationFromQueue,
  shouldForceReservationQueueWhilePending,
  participantHasQueuedReservation,
  queueEntryMatchesParticipant,
} from './song-reservation-queue-order';
import type { SelectionRoundParticipant } from '@/lib/room-selection-round';

const order: SelectionRoundParticipant[] = [
  { clientId: 'a' },
  { clientId: 'b' },
  { clientId: 'c' },
  { clientId: 'ai' },
];
const present = new Set(['a', 'b', 'c', 'ai']);

test('resolveSongReservationQueueApply: prompt when earlier user has no queue', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'b',
      participatingOrder: order,
      presentClientIds: present,
      queue: [{ publisherClientId: 'ai' }],
    }),
    { kind: 'prompt', clientId: 'b' },
  );
});

test('resolveSongReservationQueueApply: prompt when ron unset but hachi queued', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'b',
      participatingOrder: order,
      presentClientIds: present,
      queue: [{ publisherClientId: 'c' }],
    }),
    { kind: 'prompt', clientId: 'b' },
  );
});

test('resolveSongReservationQueueApply: apply due user entry even if not FIFO head', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'b',
      participatingOrder: order,
      presentClientIds: present,
      queue: [{ publisherClientId: 'ai' }, { publisherClientId: 'b' }],
    }),
    { kind: 'apply', queueIndex: 1 },
  );
});

test('resolveSongReservationQueueApply: apply when queue uses authUserId and ring uses live clientId', () => {
  const auth = '11111111-1111-1111-1111-111111111111';
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'mc-u-live',
      participatingOrder: [{ clientId: 'mc-u-live' }, { clientId: 'b' }],
      presentClientIds: new Set(['mc-u-live', 'b']),
      queue: [{ publisherClientId: 'old-ably-cid', publisherAuthUserId: auth }],
      participantIdentities: [{ clientId: 'mc-u-live', authUserId: auth }],
    }),
    { kind: 'apply', queueIndex: 0 },
  );
});

test('participantHasQueuedReservation: matches authUserId when clientId differs', () => {
  const auth = '22222222-2222-2222-2222-222222222222';
  assert.equal(
    participantHasQueuedReservation(
      'mc-u-hachi',
      [{ publisherClientId: 'ably-old', publisherAuthUserId: auth }],
      [{ clientId: 'mc-u-hachi', authUserId: auth }],
    ),
    true,
  );
});

test('participantHasQueuedReservation: matches displayName when clientId differs', () => {
  assert.equal(
    participantHasQueuedReservation(
      'mc-u-hachi',
      [{ publisherClientId: 'ably-old', publisherDisplayName: 'ハチ' }],
      [{ clientId: 'mc-u-hachi', displayName: 'ハチ' }],
    ),
    true,
  );
});

test('queueEntryMatchesParticipant: false for unrelated participant', () => {
  assert.equal(
    queueEntryMatchesParticipant(
      { publisherClientId: 'x' },
      'mc-u-hachi',
      [{ clientId: 'mc-u-hachi', authUserId: 'aaa' }],
    ),
    false,
  );
});

test('resolveSongReservationQueueApply: apply FIFO head when it matches turn order', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'b',
      participatingOrder: order,
      presentClientIds: present,
      queue: [{ publisherClientId: 'b' }, { publisherClientId: 'c' }],
    }),
    { kind: 'apply', queueIndex: 0 },
  );
});

test('resolveQueueScanStartClientId: advances past solo poster when ring grew', () => {
  assert.equal(
    resolveQueueScanStartClientId({
      currentTurnClientId: 'a',
      lastSongPosterClientId: 'a',
      participatingOrder: [{ clientId: 'a' }, { clientId: 'b' }],
      presentClientIds: new Set(['a', 'b']),
    }),
    'b',
  );
});

test('resolveQueueScanStartClientId: keeps turn when not the active poster', () => {
  assert.equal(
    resolveQueueScanStartClientId({
      currentTurnClientId: 'b',
      lastSongPosterClientId: 'a',
      participatingOrder: [{ clientId: 'a' }, { clientId: 'b' }],
      presentClientIds: new Set(['a', 'b']),
    }),
    'b',
  );
});

test('resolveSongReservationQueueApply: late joiner queued after solo post is applied', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'a',
      lastSongPosterClientId: 'a',
      participatingOrder: [{ clientId: 'a' }, { clientId: 'b' }],
      presentClientIds: new Set(['a', 'b']),
      queue: [{ publisherClientId: 'b' }],
    }),
    { kind: 'apply', queueIndex: 0 },
  );
});

test('resolveSongReservationQueueApply: solo poster alone still prompts self when queued empty for others', () => {
  assert.deepEqual(
    resolveSongReservationQueueApply({
      currentTurnClientId: 'a',
      lastSongPosterClientId: 'a',
      participatingOrder: [{ clientId: 'a' }],
      presentClientIds: new Set(['a']),
      queue: [{ publisherClientId: 'a' }],
    }),
    { kind: 'apply', queueIndex: 0 },
  );
});

test('removePublisherReservationFromQueue: keeps other publishers', () => {
  const q = [
    { publisherClientId: 'ai', videoId: 'v1' },
    { publisherClientId: 'b', videoId: 'v2' },
  ];
  assert.deepEqual(removePublisherReservationFromQueue(q, 'b'), [{ publisherClientId: 'ai', videoId: 'v1' }]);
});

test('shouldForceReservationQueueWhilePending: true when queue exists during playback', () => {
  assert.equal(
    shouldForceReservationQueueWhilePending({
      queueLength: 1,
      hasActiveVideo: true,
      withinEndedGraceWindow: false,
      participatingCount: 3,
      uniqueDisplayNameCount: 3,
    }),
    true,
  );
});

test('shouldForceReservationQueueWhilePending: true in ended grace window', () => {
  assert.equal(
    shouldForceReservationQueueWhilePending({
      queueLength: 2,
      hasActiveVideo: false,
      withinEndedGraceWindow: true,
      participatingCount: 3,
      uniqueDisplayNameCount: 3,
    }),
    true,
  );
});
