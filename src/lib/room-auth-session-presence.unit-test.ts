import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasLiveAuthClientInPresence,
  isLiveAuthPresenceMember,
  ROOM_AUTH_PRESENCE_STALE_MS,
} from './room-auth-session-presence';

const authCid = 'mc-u-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('isLiveAuthPresenceMember: fresh timestamp counts as live', () => {
  assert.equal(
    isLiveAuthPresenceMember(
      { clientId: authCid, action: 'present', timestamp: Date.now() - 1000 } as never,
      authCid,
    ),
    true,
  );
});

test('isLiveAuthPresenceMember: stale timestamp is ignored', () => {
  assert.equal(
    isLiveAuthPresenceMember(
      {
        clientId: authCid,
        action: 'present',
        timestamp: Date.now() - ROOM_AUTH_PRESENCE_STALE_MS - 1,
      } as never,
      authCid,
    ),
    false,
  );
});

test('hasLiveAuthClientInPresence: other clientId ignored', () => {
  assert.equal(
    hasLiveAuthClientInPresence(
      [{ clientId: 'guest-1', action: 'present', timestamp: Date.now() } as never],
      authCid,
    ),
    false,
  );
});
