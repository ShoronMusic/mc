import assert from 'node:assert/strict';
import { buildSongQuizResultAnnouncement, getSongQuizRevealDelayMs } from './song-quiz-result-announcement';

const origReveal = process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS;

function testBuild() {
  const choices = ['A', 'B', 'C'];
  assert.match(
    buildSongQuizResultAnnouncement(0, choices, [{ displayName: '太郎', pickedIndex: 0 }]),
    /正解は 1番「A」/,
  );
  assert.match(
    buildSongQuizResultAnnouncement(0, choices, [{ displayName: '太郎', pickedIndex: 0 }]),
    /正解者: 太郎さん/,
  );
  assert.match(
    buildSongQuizResultAnnouncement(0, choices, [
      { displayName: '太郎', pickedIndex: 0 },
      { displayName: '花子', pickedIndex: 0 },
    ]),
    /正解者: 太郎さん、花子さん/,
  );
  assert.match(
    buildSongQuizResultAnnouncement(0, choices, [{ displayName: '太郎', pickedIndex: 1 }]),
    /不正解のみ/,
  );
  assert.match(buildSongQuizResultAnnouncement(0, choices, []), /未回答/);
}

function testRevealMs() {
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = '12000';
  assert.equal(getSongQuizRevealDelayMs(), 12_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = '1000';
  assert.equal(getSongQuizRevealDelayMs(), 90_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = '';
  assert.equal(getSongQuizRevealDelayMs(), 90_000);
}

try {
  testBuild();
  testRevealMs();
  console.log('song-quiz-result-announcement: ok');
} finally {
  if (origReveal === undefined) {
    delete process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS;
  } else {
    process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = origReveal;
  }
}
