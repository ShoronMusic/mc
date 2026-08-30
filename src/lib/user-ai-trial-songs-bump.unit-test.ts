import assert from 'node:assert/strict';
import { computeTrialAtQuestionsGrantBump, computeTrialSongsGrantBump } from '@/lib/user-ai-trial-server';

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

assert.deepEqual(
  computeTrialAtQuestionsGrantBump({ at_questions_granted: 5, at_questions_remaining: 5 }, 10),
  { at_questions_granted: 10, at_questions_remaining: 10 },
);
assert.deepEqual(
  computeTrialAtQuestionsGrantBump({ at_questions_granted: 5, at_questions_remaining: 1 }, 10),
  { at_questions_granted: 10, at_questions_remaining: 6 },
);
assert.deepEqual(
  computeTrialAtQuestionsGrantBump({ at_questions_granted: 5, at_questions_remaining: 0 }, 10),
  { at_questions_granted: 10, at_questions_remaining: 5 },
);
assert.equal(
  computeTrialAtQuestionsGrantBump({ at_questions_granted: 10, at_questions_remaining: 2 }, 10),
  null,
);

console.log('user-ai-trial-songs-bump.unit-test: ok');
