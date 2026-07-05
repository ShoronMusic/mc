import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBrowserTabId,
  getOrCreateRoomSessionClaim,
  getRoomSessionClaimStorageKey,
  isRoomClaimOwnedByThisBrowserTab,
  readRoomSessionClaim,
  regenerateRoomSessionClaim,
} from './room-session-instance';

const ROOM = 'test-room';

function resetStorage() {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return false;
  localStorage.removeItem(getRoomSessionClaimStorageKey(ROOM));
  sessionStorage.removeItem(getRoomSessionClaimStorageKey(ROOM));
  sessionStorage.removeItem('mc:browser_tab_id');
  return true;
}

function setOtherTabClaim(claim: { instanceId: string; claimedAtMs: number; browserTabId: string }) {
  const key = getRoomSessionClaimStorageKey(ROOM);
  const raw = JSON.stringify(claim);
  localStorage.setItem(key, raw);
  sessionStorage.setItem(key, raw);
}

test('getOrCreateRoomSessionClaim: creates claim with browserTabId', () => {
  if (!resetStorage()) {
    console.log('room-session-instance.unit-test.ts: skip (no storage)');
    return;
  }
  const tabId = getBrowserTabId();
  const claim = getOrCreateRoomSessionClaim(ROOM);
  assert.ok(claim.instanceId);
  assert.ok(claim.claimedAtMs > 0);
  assert.equal(claim.browserTabId, tabId);
  assert.equal(readRoomSessionClaim(ROOM)?.instanceId, claim.instanceId);
});

test('getOrCreateRoomSessionClaim: same tab reuses existing claim', () => {
  if (!resetStorage()) return;
  const first = getOrCreateRoomSessionClaim(ROOM);
  const second = getOrCreateRoomSessionClaim(ROOM);
  assert.equal(second.instanceId, first.instanceId);
  assert.equal(second.claimedAtMs, first.claimedAtMs);
});

test('getOrCreateRoomSessionClaim: different tab generates newer claim', () => {
  if (!resetStorage()) return;
  const tab1 = getBrowserTabId();
  const first = getOrCreateRoomSessionClaim(ROOM);
  setOtherTabClaim({
    instanceId: first.instanceId,
    claimedAtMs: first.claimedAtMs,
    browserTabId: 'other-tab-id',
  });
  sessionStorage.setItem('mc:browser_tab_id', 'other-tab-id');
  const second = getOrCreateRoomSessionClaim(ROOM);
  assert.notEqual(second.instanceId, first.instanceId);
  assert.ok(second.claimedAtMs > first.claimedAtMs);
  assert.equal(second.browserTabId, 'other-tab-id');
  sessionStorage.setItem('mc:browser_tab_id', tab1);
});

test('isRoomClaimOwnedByThisBrowserTab: false when another tab owns claim', () => {
  if (!resetStorage()) return;
  getOrCreateRoomSessionClaim(ROOM);
  const myTab = getBrowserTabId();
  setOtherTabClaim({
    instanceId: 'x',
    claimedAtMs: 100,
    browserTabId: 'foreign-tab',
  });
  assert.equal(isRoomClaimOwnedByThisBrowserTab(ROOM), false);
  sessionStorage.setItem('mc:browser_tab_id', myTab);
});

test('regenerateRoomSessionClaim: assigns current browserTabId', () => {
  if (!resetStorage()) return;
  getOrCreateRoomSessionClaim(ROOM);
  const tabId = getBrowserTabId();
  const next = regenerateRoomSessionClaim(ROOM);
  assert.equal(next.browserTabId, tabId);
  assert.ok(next.claimedAtMs > 0);
});
