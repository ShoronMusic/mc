import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkArray,
  jstDateKeyFromPlayedAt,
  songRowHasPersistedMusic8,
} from '@/lib/admin-music8-pending';

test('songRowHasPersistedMusic8: null / non-object', () => {
  assert.equal(songRowHasPersistedMusic8(null), false);
  assert.equal(songRowHasPersistedMusic8(undefined), false);
  assert.equal(songRowHasPersistedMusic8('x'), false);
  assert.equal(songRowHasPersistedMusic8([]), false);
  assert.equal(songRowHasPersistedMusic8({}), false);
});

test('songRowHasPersistedMusic8: known kinds', () => {
  assert.equal(songRowHasPersistedMusic8({ kind: 'musicaichat_v1' }), true);
  assert.equal(songRowHasPersistedMusic8({ kind: 'music8_wp_song', id: 1 }), true);
  assert.equal(songRowHasPersistedMusic8({ kind: 'other' }), false);
});

test('jstDateKeyFromPlayedAt', () => {
  assert.equal(jstDateKeyFromPlayedAt('2026-04-27T15:00:00.000Z'), '2026-04-28');
  assert.equal(jstDateKeyFromPlayedAt('2026-04-28T14:59:59.999Z'), '2026-04-28');
});

test('chunkArray', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4], 2), [
    [1, 2],
    [3, 4],
  ]);
  assert.deepEqual(chunkArray([1], 10), [[1]]);
});
