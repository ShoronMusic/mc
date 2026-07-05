import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSongReservationQueueApply,
  removePublisherReservationFromQueue,
  shouldForceReservationQueueWhilePending,
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
