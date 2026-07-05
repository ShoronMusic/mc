import assert from 'node:assert';
import {
  authUserIdFromRoomClientId,
  resolveOwnerStillPresent,
} from './room-owner';

const AUTH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

assert.strictEqual(authUserIdFromRoomClientId(`mc-u-${AUTH}`), AUTH);
assert.strictEqual(authUserIdFromRoomClientId('guest-uuid'), null);

assert.strictEqual(
  resolveOwnerStillPresent('old-client', [{ clientId: 'old-client', displayName: 'x' } as never]),
  true,
);
assert.strictEqual(
  resolveOwnerStillPresent(`mc-u-${AUTH}`, [{ clientId: `mc-u-${AUTH}`, authUserId: AUTH }]),
  true,
);
assert.strictEqual(
  resolveOwnerStillPresent(`mc-u-${AUTH}`, [{ clientId: 'other', authUserId: AUTH }]),
  true,
);
assert.strictEqual(
  resolveOwnerStillPresent('gone-owner', [{ clientId: 'other', authUserId: 'other-id' }]),
  false,
);
console.log('room-owner.unit-test.ts: ok');
