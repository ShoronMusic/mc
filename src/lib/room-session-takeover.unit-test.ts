import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRoomSessionTakeoverState } from './room-session-takeover';

const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const myCid = `mc-u-${uid}`;

test('detectRoomSessionTakeoverState: active when connected and in presence', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [{ clientId: myCid, authUserId: uid }],
    }),
    'active',
  );
});

test('detectRoomSessionTakeoverState: supplanted when disconnected but same clientId in presence', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      authUserId: uid,
      isGuest: false,
      connectionState: 'disconnected',
      presenceRows: [{ clientId: myCid, authUserId: uid }],
    }),
    'supplanted',
  );
});

test('detectRoomSessionTakeoverState: guest', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: 'random',
      authUserId: uid,
      isGuest: true,
      connectionState: 'connected',
      presenceRows: [],
    }),
    'guest',
  );
});
