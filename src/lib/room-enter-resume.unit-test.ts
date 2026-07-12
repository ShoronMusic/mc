import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLastRoomEnter,
  getLastRoomEnterForRoom,
  rememberLastRoomEnter,
} from './room-enter-resume';

const ROOM = '02';

function withProduct(value: string, fn: () => void) {
  const prev = process.env.NEXT_PUBLIC_PRODUCT;
  process.env.NEXT_PUBLIC_PRODUCT = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PRODUCT;
    else process.env.NEXT_PUBLIC_PRODUCT = prev;
  }
}

function clearEnterResumeStorage() {
  if (typeof localStorage === 'undefined') return false;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('mc:last_room_enter_v1')) localStorage.removeItem(key);
  }
  return true;
}

test('rememberLastRoomEnter: ma と mc で同じ roomId でも別スナップショット', () => {
  if (!clearEnterResumeStorage()) {
    console.log('room-enter-resume.unit-test.ts: skip (no storage)');
    return;
  }

  withProduct('musicaichat', () => {
    rememberLastRoomEnter({
      roomId: ROOM,
      displayName: 'ma-user',
      isGuest: false,
      authUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(getLastRoomEnterForRoom(ROOM)?.displayName, 'ma-user');
  });

  withProduct('musicchat', () => {
    assert.equal(getLastRoomEnterForRoom(ROOM), null);
    rememberLastRoomEnter({
      roomId: ROOM,
      displayName: 'mc-user',
      isGuest: false,
      authUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(getLastRoomEnterForRoom(ROOM)?.displayName, 'mc-user');
  });

  withProduct('musicaichat', () => {
    assert.equal(getLastRoomEnterForRoom(ROOM)?.displayName, 'ma-user');
    clearLastRoomEnter(ROOM);
  });

  withProduct('musicchat', () => {
    clearLastRoomEnter(ROOM);
  });
});

test('rememberLastRoomEnter: legacy ma キーから product 付きキーへ移行', () => {
  if (!clearEnterResumeStorage()) return;

  const legacy = JSON.stringify({
    roomId: ROOM,
    displayName: 'legacy-ma',
    isGuest: false,
    authUserId: null,
    atMs: Date.now(),
  });
  localStorage.setItem('mc:last_room_enter_v1', legacy);

  withProduct('musicaichat', () => {
    assert.equal(getLastRoomEnterForRoom(ROOM)?.displayName, 'legacy-ma');
    assert.equal(localStorage.getItem('mc:last_room_enter_v1'), null);
    clearLastRoomEnter(ROOM);
  });
});
