import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeParticipantsByAuthUserId } from './room-participant-dedupe';

const uid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('dedupeParticipantsByAuthUserId: same auth keeps earliest', () => {
  const rows = [
    { clientId: 'b', authUserId: uid, timestamp: 200 },
    { clientId: 'a', authUserId: uid, timestamp: 100 },
  ];
  const out = dedupeParticipantsByAuthUserId(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].clientId, 'a');
});

test('dedupeParticipantsByAuthUserId: prefers myClientId', () => {
  const rows = [
    { clientId: 'old', authUserId: uid, timestamp: 100 },
    { clientId: 'mine', authUserId: uid, timestamp: 200 },
  ];
  const out = dedupeParticipantsByAuthUserId(rows, 'mine');
  assert.equal(out[0].clientId, 'mine');
});

test('dedupeParticipantsByAuthUserId: guests unchanged', () => {
  const rows = [
    { clientId: 'g1', timestamp: 1 },
    { clientId: 'g2', timestamp: 2 },
  ];
  assert.equal(dedupeParticipantsByAuthUserId(rows).length, 2);
});
