/**
 * `npx tsx src/lib/song-quiz-official-heuristic.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  evaluateSongQuizOfficialHeuristic,
  resetSongQuizOfficialChannelEnvCacheForTests,
} from './song-quiz-official-heuristic';
import { resetJpOfficialChannelExceptionCacheForTests } from './jp-official-channel-exception';

function resetEnv() {
  delete process.env.SONG_QUIZ_OFFICIAL_CHANNEL_IDS;
  resetSongQuizOfficialChannelEnvCacheForTests();
  resetJpOfficialChannelExceptionCacheForTests();
}

try {
  resetEnv();
  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: 'UCzycs8MqvIY4nXWwS-v4J9g',
      channelTitle: 'ONE OK ROCK',
      videoTitle: 'ONE OK ROCK - The Beginning',
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'BonJoviVEVO',
      videoTitle: "Bon Jovi - It's My Life",
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Taylor Swift - Topic',
      videoTitle: 'Anti-Hero',
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Queen Official',
      videoTitle: 'Queen - Bohemian Rhapsody',
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Random Fan Covers',
      videoTitle: 'Cover of Hit Song',
    }).tier,
    'deny',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Indie Band Name',
      videoTitle: 'Our new single',
    }).tier,
    'uncertain',
  );

  process.env.SONG_QUIZ_OFFICIAL_CHANNEL_IDS = 'UC1234567890123456789012';
  resetSongQuizOfficialChannelEnvCacheForTests();
  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: 'UC1234567890123456789012',
      channelTitle: 'Who Knows',
      videoTitle: 'x',
    }).tier,
    'allow',
  );

  console.log('song-quiz-official-heuristic unit tests: OK');
} finally {
  resetEnv();
}
