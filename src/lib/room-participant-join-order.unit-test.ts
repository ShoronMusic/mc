import assert from 'node:assert';
import {
  buildJoinOrderIdentityKey,
  joinOrderStorageKey,
  orderParticipantsWithOwnerFirst,
  persistJoinedAtMs,
  readPersistedJoinedAtMs,
  resolveJoinedAtMsForSession,
  sortKeyForPresenceMember,
} from './room-participant-join-order';

const ROOM = '03';
const AUTH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function testIdentityKey() {
  assert.strictEqual(
    buildJoinOrderIdentityKey({ authUserId: AUTH }),
    `auth:${AUTH}`,
  );
  assert.strictEqual(
    buildJoinOrderIdentityKey({ isGuest: true, displayName: 'ちひろ' }),
    'guest:ちひろ',
  );
  assert.strictEqual(buildJoinOrderIdentityKey({ isGuest: true, displayName: 'ゲスト' }), null);
}

function testSessionStorageRoundTrip() {
  if (typeof sessionStorage === 'undefined') {
    console.log('room-participant-join-order.unit-test.ts: skip sessionStorage (non-browser)');
    return;
  }
  const key = joinOrderStorageKey(ROOM, `auth:${AUTH}`);
  sessionStorage.removeItem(key);
  persistJoinedAtMs(ROOM, `auth:${AUTH}`, 1_700_000_000_000);
  assert.strictEqual(readPersistedJoinedAtMs(ROOM, `auth:${AUTH}`), 1_700_000_000_000);
  sessionStorage.removeItem(key);
}

function testResolveJoinedAtMsForSession() {
  if (typeof sessionStorage === 'undefined') {
    console.log('room-participant-join-order.unit-test.ts: skip resolve (non-browser)');
    return;
  }
  const identity = `auth:${AUTH}`;
  sessionStorage.removeItem(joinOrderStorageKey(ROOM, identity));
  const first = resolveJoinedAtMsForSession({
    roomId: ROOM,
    authUserId: AUTH,
    nowMs: 1000,
  });
  assert.strictEqual(first, 1000);
  const second = resolveJoinedAtMsForSession({
    roomId: ROOM,
    authUserId: AUTH,
    nowMs: 999_999,
  });
  assert.strictEqual(second, 1000);
  sessionStorage.removeItem(joinOrderStorageKey(ROOM, identity));
}

function testSortKeyPrefersPersisted() {
  if (typeof sessionStorage === 'undefined') {
    console.log('room-participant-join-order.unit-test.ts: skip sortKey (non-browser)');
    return;
  }
  const identity = `auth:${AUTH}`;
  sessionStorage.removeItem(joinOrderStorageKey(ROOM, identity));
  persistJoinedAtMs(ROOM, identity, 500);
  const sk = sortKeyForPresenceMember({
    roomId: ROOM,
    clientId: 'new-client',
    authUserId: AUTH,
    joinedAtMs: 9000,
  });
  assert.strictEqual(sk, 500);
  sessionStorage.removeItem(joinOrderStorageKey(ROOM, identity));
}

function testOrderParticipantsWithOwnerFirst() {
  const rows = [
    { clientId: 'a', displayName: 'A' },
    { clientId: 'b', displayName: 'B' },
    { clientId: 'c', displayName: 'C' },
  ];
  assert.deepStrictEqual(orderParticipantsWithOwnerFirst(rows, 'a'), rows);
  assert.deepStrictEqual(orderParticipantsWithOwnerFirst(rows, 'b'), [
    { clientId: 'b', displayName: 'B' },
    { clientId: 'c', displayName: 'C' },
    { clientId: 'a', displayName: 'A' },
  ]);
  assert.deepStrictEqual(orderParticipantsWithOwnerFirst(rows, ''), rows);
  assert.deepStrictEqual(orderParticipantsWithOwnerFirst(rows, 'missing'), rows);
}

testIdentityKey();
testSessionStorageRoundTrip();
testResolveJoinedAtMsForSession();
testSortKeyPrefersPersisted();
testOrderParticipantsWithOwnerFirst();
console.log('room-participant-join-order.unit-test.ts: ok');
