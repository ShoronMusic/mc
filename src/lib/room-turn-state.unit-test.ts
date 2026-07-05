import assert from 'node:assert';
import {
  buildTurnStatePersistData,
  resolvePersistedTurnClientId,
} from './room-turn-state';

function testResolveByAuth() {
  const persisted = buildTurnStatePersistData({
    currentTurnClientId: 'old-client',
    gatheringStartedAt: '2026-07-05T00:00:00Z',
    turnAuthUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  });
  const resolved = resolvePersistedTurnClientId(persisted, [
    { clientId: 'new-client', authUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
  ]);
  assert.strictEqual(resolved, 'new-client');
}

function testResolveByGuestName() {
  const persisted = buildTurnStatePersistData({
    currentTurnClientId: 'old-guest',
    turnGuestDisplayName: 'ちひろ',
  });
  const resolved = resolvePersistedTurnClientId(persisted, [
    { clientId: 'new-guest', displayName: 'ちひろ', isGuest: true },
  ]);
  assert.strictEqual(resolved, 'new-guest');
}

function testResolveKeepsStoredWhenUnknown() {
  const persisted = buildTurnStatePersistData({ currentTurnClientId: 'gone' });
  assert.strictEqual(resolvePersistedTurnClientId(persisted, []), 'gone');
}

testResolveByAuth();
testResolveByGuestName();
testResolveKeepsStoredWhenUnknown();
console.log('room-turn-state.unit-test.ts: ok');
