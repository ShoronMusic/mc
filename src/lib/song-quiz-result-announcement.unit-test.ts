import assert from 'node:assert/strict';
import {
  buildSongQuizResultAnnouncement,
  getSongQuizRevealDelayMs,
  getSongQuizRevealExtendMs,
  getSongQuizRevealFastMs,
  getSongQuizRevealMaxMs,
} from './song-quiz-result-announcement';

const origReveal = process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS;
const origExtend = process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS;
const origMax = process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS;
const origFast = process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS;

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
  assert.equal(getSongQuizRevealDelayMs(), 18_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = '';
  assert.equal(getSongQuizRevealDelayMs(), 18_000);
}

function testExtendMaxFastMs() {
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS = '15000';
  assert.equal(getSongQuizRevealExtendMs(), 15_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS = '500';
  assert.equal(getSongQuizRevealExtendMs(), 12_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS = '';

  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS = '90000';
  assert.equal(getSongQuizRevealMaxMs(), 90_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS = '1000';
  assert.equal(getSongQuizRevealMaxMs(), 120_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS = '';

  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS = '800';
  assert.equal(getSongQuizRevealFastMs(), 800);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS = '50';
  assert.equal(getSongQuizRevealFastMs(), 2_000);
  process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS = '';
}

try {
  testBuild();
  testRevealMs();
  testExtendMaxFastMs();
  console.log('song-quiz-result-announcement: ok');
} finally {
  if (origReveal === undefined) {
    delete process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS;
  } else {
    process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MS = origReveal;
  }
  if (origExtend === undefined) delete process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS;
  else process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_EXTEND_MS = origExtend;
  if (origMax === undefined) delete process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS;
  else process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_MAX_MS = origMax;
  if (origFast === undefined) delete process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS;
  else process.env.NEXT_PUBLIC_SONG_QUIZ_REVEAL_FAST_MS = origFast;
}
