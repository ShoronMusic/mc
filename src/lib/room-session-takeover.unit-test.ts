import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRoomSessionTakeoverState } from './room-session-takeover';

const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const myCid = `mc-u-${uid}`;
const instA = '11111111-1111-1111-1111-111111111111';
const instB = '22222222-2222-2222-2222-222222222222';

test('detectRoomSessionTakeoverState: active when sessionInstanceId matches', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionInstanceId: instA,
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [{ clientId: myCid, authUserId: uid, sessionInstanceId: instA }],
    }),
    'active',
  );
});

test('detectRoomSessionTakeoverState: supplanted when same clientId but other sessionInstanceId', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionInstanceId: instA,
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [{ clientId: myCid, authUserId: uid, sessionInstanceId: instB }],
    }),
    'supplanted',
  );
});

test('detectRoomSessionTakeoverState: guest', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: 'random',
      mySessionInstanceId: instA,
      authUserId: uid,
      isGuest: true,
      connectionState: 'connected',
      presenceRows: [],
    }),
    'guest',
  );
});
