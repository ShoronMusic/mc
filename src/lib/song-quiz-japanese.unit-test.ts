/**
 * `npx tsx src/lib/song-quiz-japanese.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { songQuizPayloadLooksJapanese } from './song-quiz-types';

const jpOk = songQuizPayloadLooksJapanese({
  question: 'この曲のサウンドで特に印象的なのは、次のうちどれでしょう？',
  choices: [
    'アコースティックギターの繊細なアルペジオです',
    '派手なシンセサイザーの連打です',
    '重厚なブラス隊のファンファーレです',
  ],
  correctIndex: 0,
  explanation: '曲解説ではアコースティックの響きが強調されています。',
});
assert.equal(jpOk, true);

const enNg = songQuizPayloadLooksJapanese({
  question: 'What is the most distinctive sonic element in Tears In Heaven?',
  choices: [
    'Delicate acoustic guitar arpeggios',
    'Heavy synthesizer stabs',
    'A brass fanfare intro',
  ],
  correctIndex: 0,
  explanation: 'The commentary highlights the acoustic guitar texture.',
});
assert.equal(enNg, false);

console.log('song-quiz-japanese unit tests: OK');
