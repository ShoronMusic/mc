import assert from 'node:assert';
import {
  computeNextSelectionRound,
  getSelectablePresentRing,
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

testRing();
testRoundIncrement();
testAnchorWhenOwnerAbsent();
testSingleParticipantNoBump();
console.log('room-selection-round.unit-test.ts: ok');
