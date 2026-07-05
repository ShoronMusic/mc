import assert from 'node:assert';
import {
  buildSelectionRoundPersistData,
  computeNextSelectionRound,
  getSelectablePresentRing,
  readPersistedSelectionRound,
  selectionRoundGatheringMatches,
  selectionRoundStorageKey,
} from './room-selection-round';

function testRing() {
  const order = [
    { clientId: 'a', participatesInSelection: true },
    { clientId: 'b', participatesInSelection: true, isAway: true },
    { clientId: 'c', participatesInSelection: true },
  ];
  const present = new Set(['a', 'b', 'c']);
  assert.deepStrictEqual(getSelectablePresentRing(order, present), ['a', 'c']);
}

function testRoundIncrement() {
  const ring = ['owner', 'x', 'y'];
  assert.strictEqual(
    computeNextSelectionRound({
      previousRound: 2,
      afterClientId: 'y',
      nextTurnClientId: 'owner',
      ownerClientId: 'owner',
      ring,
    }),
    3,
  );
  assert.strictEqual(
    computeNextSelectionRound({
      previousRound: 2,
      afterClientId: 'owner',
      nextTurnClientId: 'x',
      ownerClientId: 'owner',
      ring,
    }),
    2,
  );
}

function testAnchorWhenOwnerAbsent() {
  const ring = ['a', 'b'];
  assert.strictEqual(
    computeNextSelectionRound({
      previousRound: 1,
      afterClientId: 'b',
      nextTurnClientId: 'a',
      ownerClientId: 'owner',
      ring,
    }),
    2,
  );
}

function testSingleParticipantNoBump() {
  assert.strictEqual(
    computeNextSelectionRound({
      previousRound: 4,
      afterClientId: 'solo',
      nextTurnClientId: 'solo',
      ownerClientId: 'solo',
      ring: ['solo'],
    }),
    4,
  );
}

function testGatheringMatches() {
  assert.strictEqual(selectionRoundGatheringMatches(null, null), true);
  assert.strictEqual(selectionRoundGatheringMatches(undefined, undefined), true);
  assert.strictEqual(
    selectionRoundGatheringMatches('2026-07-05T00:00:00Z', '2026-07-05T00:00:00Z'),
    true,
  );
  assert.strictEqual(
    selectionRoundGatheringMatches('2026-04-02T00:00:00Z', '2026-07-05T00:00:00Z'),
    false,
  );
  assert.strictEqual(selectionRoundGatheringMatches('2026-07-05T00:00:00Z', null), false);
  assert.strictEqual(selectionRoundGatheringMatches(null, '2026-07-05T00:00:00Z'), false);
}

function testBuildPersistData() {
  const data = buildSelectionRoundPersistData({
    round: 3.7,
    ownerClientId: ' owner-a ',
    gatheringStartedAt: ' 2026-07-05T00:00:00Z ',
  });
  assert.strictEqual(data.round, 3);
  assert.strictEqual(data.ownerClientId, 'owner-a');
  assert.strictEqual(data.gatheringStartedAt, '2026-07-05T00:00:00Z');
  assert.strictEqual(typeof data.updatedAt, 'number');
}

function testPersistIgnoresOwnerClientIdOnRead() {
  if (typeof sessionStorage === 'undefined') {
    console.log('room-selection-round.unit-test.ts: skip sessionStorage (non-browser)');
    return;
  }
  const roomId = 'test-room-round';
  const key = selectionRoundStorageKey(roomId);
  sessionStorage.removeItem(key);
  sessionStorage.setItem(
    key,
    JSON.stringify({
      round: 5,
      ownerClientId: 'old-owner',
      updatedAt: Date.now(),
      gatheringStartedAt: '2026-07-05T00:00:00Z',
    }),
  );
  assert.strictEqual(
    readPersistedSelectionRound(roomId, { gatheringStartedAt: '2026-07-05T00:00:00Z' }),
    5,
  );
  assert.strictEqual(
    readPersistedSelectionRound(roomId, { gatheringStartedAt: '2026-04-02T00:00:00Z' }),
    null,
  );
  sessionStorage.removeItem(key);
}

testRing();
testRoundIncrement();
testAnchorWhenOwnerAbsent();
testSingleParticipantNoBump();
testGatheringMatches();
testBuildPersistData();
testPersistIgnoresOwnerClientIdOnRead();
console.log('room-selection-round.unit-test.ts: ok');
