import assert from 'node:assert';
import {
  rememberPublisherIdentity,
  resolveActivePublisherClientId,
  resolveAndRememberSongPoster,
  resolvePublisherDisplayName,
} from './room-publisher-identity';

const AUTH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function testResolveDisplayName() {
  const map = new Map<string, { displayName: string; authUserId?: string }>();
  rememberPublisherIdentity(map, 'old-cid', '桐子', AUTH);
  const name = resolvePublisherDisplayName(
    'old-cid',
    map,
    [{ clientId: 'new-cid', displayName: '桐子', authUserId: AUTH }],
  );
  assert.strictEqual(name, '桐子');
}

function testResolveActiveClientId() {
  const active = resolveActivePublisherClientId('old-cid', AUTH, [
    { clientId: 'new-cid', authUserId: AUTH },
  ]);
  assert.strictEqual(active, 'new-cid');
}

function testFallbackGuest() {
  const map = new Map<string, { displayName: string; authUserId?: string }>();
  assert.strictEqual(
    resolvePublisherDisplayName('gone', map, []),
    'ゲスト',
  );
}

function testResolveAndRememberUsesDisplayNameHint() {
  const map = new Map<string, { displayName: string; authUserId?: string }>();
  const { clientId, displayName } = resolveAndRememberSongPoster({
    map,
    publisherClientId: 'stale-cid',
    publisherAuthUserId: AUTH,
    publisherDisplayName: '桐子',
    participants: [{ clientId: 'live-cid', displayName: '別名', authUserId: AUTH }],
  });
  assert.strictEqual(clientId, 'live-cid');
  assert.strictEqual(displayName, '桐子');
}

testResolveDisplayName();
testResolveActiveClientId();
testFallbackGuest();
testResolveAndRememberUsesDisplayNameHint();
console.log('room-publisher-identity.unit-test.ts: ok');
