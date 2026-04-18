/**
 * `npx tsx src/lib/song-quiz-choice-shuffle.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { shuffleQuizChoicesDeterministic } from './song-quiz-choice-shuffle';

const base: [string, string, string] = ['A', 'B', 'C'];

function correctLetter(
  out: { choices: [string, string, string]; correctIndex: 0 | 1 | 2 },
): string {
  return out.choices[out.correctIndex];
}

let saw0 = false;
let saw1 = false;
let saw2 = false;
for (let s = 0; s < 5000; s++) {
  const out = shuffleQuizChoicesDeterministic(base, 1, s);
  assert.equal(correctLetter(out), 'B');
  assert.deepEqual([...out.choices].sort(), ['A', 'B', 'C']);
  if (out.correctIndex === 0) saw0 = true;
  if (out.correctIndex === 1) saw1 = true;
  if (out.correctIndex === 2) saw2 = true;
}
assert.ok(saw0 && saw1 && saw2, 'correctIndex should hit 0,1,2 over many seeds');

const inv = shuffleQuizChoicesDeterministic(base, 0, 999_001);
assert.equal(correctLetter(inv), 'A');

console.log('song-quiz-choice-shuffle unit tests: OK');
