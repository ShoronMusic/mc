import assert from 'node:assert/strict';
import { computeTrialSongsGrantBump } from '@/lib/user-ai-trial-server';

assert.deepEqual(computeTrialSongsGrantBump({ songs_granted: 10, songs_remaining: 10 }, 20), {
  songs_granted: 20,
  songs_remaining: 20,
});

assert.deepEqual(computeTrialSongsGrantBump({ songs_granted: 10, songs_remaining: 3 }, 20), {
  songs_granted: 20,
  songs_remaining: 13,
});

assert.deepEqual(computeTrialSongsGrantBump({ songs_granted: 10, songs_remaining: 0 }, 20), {
  songs_granted: 20,
  songs_remaining: 10,
});

assert.equal(computeTrialSongsGrantBump({ songs_granted: 20, songs_remaining: 5 }, 20), null);
assert.equal(computeTrialSongsGrantBump({ songs_granted: 40, songs_remaining: 1 }, 20), null);

console.log('user-ai-trial-songs-bump.unit-test: ok');
