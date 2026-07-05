import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRoomSessionTakeoverState,
  shouldPublishRoomSessionPresence,
} from './room-session-takeover';

const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const myCid = `mc-u-${uid}`;

test('detectRoomSessionTakeoverState: active when claim matches', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionClaim: { instanceId: 'a', claimedAtMs: 100, browserTabId: 'tab-a' },
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [
        { clientId: myCid, authUserId: uid, sessionInstanceId: 'a', sessionClaimedAtMs: 100 },
      ],
    }),
    'active',
  );
});

test('detectRoomSessionTakeoverState: supplanted when remote claim is newer', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionClaim: { instanceId: 'a', claimedAtMs: 100, browserTabId: 'tab-a' },
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [
        { clientId: myCid, authUserId: uid, sessionInstanceId: 'b', sessionClaimedAtMs: 200 },
      ],
    }),
    'supplanted',
  );
});

test('shouldPublishRoomSessionPresence: false when remote claim is newer', () => {
  assert.equal(
    shouldPublishRoomSessionPresence({
      isGuest: false,
      myClientId: myCid,
      mySessionClaim: { instanceId: 'a', claimedAtMs: 100, browserTabId: 'tab-a' },
      presenceRows: [
        { clientId: myCid, sessionInstanceId: 'b', sessionClaimedAtMs: 200 },
      ],
    }),
    false,
  );
});

test('detectRoomSessionTakeoverState: connecting (not supplanted) when local claim is newer', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionClaim: { instanceId: 'b', claimedAtMs: 300, browserTabId: 'tab-b' },
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [
        { clientId: myCid, authUserId: uid, sessionInstanceId: 'a', sessionClaimedAtMs: 200 },
      ],
    }),
    'connecting',
  );
});

test('shouldPublishRoomSessionPresence: true when local claim is newer (takeover)', () => {
  assert.equal(
    shouldPublishRoomSessionPresence({
      isGuest: false,
      myClientId: myCid,
      mySessionClaim: { instanceId: 'b', claimedAtMs: 300, browserTabId: 'tab-b' },
      presenceRows: [
        { clientId: myCid, sessionInstanceId: 'a', sessionClaimedAtMs: 100 },
      ],
    }),
    true,
  );
});

test('detectRoomSessionTakeoverState: connecting (not supplanted) when disconnected but session matches', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionClaim: { instanceId: 'a', claimedAtMs: 100, browserTabId: 'tab-a' },
      authUserId: uid,
      isGuest: false,
      connectionState: 'disconnected',
      presenceRows: [
        { clientId: myCid, authUserId: uid, sessionInstanceId: 'a', sessionClaimedAtMs: 100 },
      ],
    }),
    'connecting',
  );
});

test('detectRoomSessionTakeoverState: connecting when remote session fields not yet published', () => {
  assert.equal(
    detectRoomSessionTakeoverState({
      myClientId: myCid,
      mySessionClaim: { instanceId: 'a', claimedAtMs: 100, browserTabId: 'tab-a' },
      authUserId: uid,
      isGuest: false,
      connectionState: 'connected',
      presenceRows: [{ clientId: myCid, authUserId: uid }],
    }),
    'connecting',
  );
});
