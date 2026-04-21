/**
 * `npx tsx src/lib/song-quiz-official-heuristic.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  evaluateSongQuizOfficialHeuristic,
  parseLeadArtistFromYoutubeTitle,
  resetSongQuizOfficialChannelEnvCacheForTests,
} from './song-quiz-official-heuristic';
import { resetJpOfficialChannelExceptionCacheForTests } from './jp-official-channel-exception';

function resetEnv() {
  delete process.env.SONG_QUIZ_OFFICIAL_CHANNEL_IDS;
  delete process.env.SONG_QUIZ_STRICT_OFFICIAL_ONLY;
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

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Indie Band Name',
      videoTitle: 'Our new single',
      viewCount: 1_250_000,
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Random Fan Covers',
      videoTitle: 'Cover of Hit Song',
      viewCount: 9_999_999,
    }).tier,
    'deny',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'The Codfather',
      videoTitle: 'Prince - Purple Rain (Official Video)',
      channelAuthorName: 'The Codfather',
    }).tier,
    'allow',
  );

  process.env.SONG_QUIZ_STRICT_OFFICIAL_ONLY = '1';
  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'The Codfather',
      videoTitle: 'Prince - Purple Rain (Official Video)',
      channelAuthorName: 'The Codfather',
    }).tier,
    'uncertain',
  );
  delete process.env.SONG_QUIZ_STRICT_OFFICIAL_ONLY;

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: 'UCsomeid',
      channelTitle: 'Prince',
      videoTitle: 'Prince - 1999 (Official Music Video)',
      channelAuthorName: 'Prince',
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Prince',
      videoTitle: 'Prince and the Revolution - When Doves Cry (Official Music Video)',
      channelAuthorName: 'Prince',
    }).tier,
    'allow',
  );

  assert.equal(
    evaluateSongQuizOfficialHeuristic({
      channelId: null,
      channelTitle: 'Cover Channel',
      videoTitle: 'Prince - 1999 (Official Music Video)',
      channelAuthorName: 'Cover Channel',
    }).tier,
    'deny',
  );

  assert.equal(parseLeadArtistFromYoutubeTitle('Prince - 1999 (Official Music Video)'), 'Prince');
  assert.equal(
    parseLeadArtistFromYoutubeTitle(
      'Prince and the Revolution - When Doves Cry (Official Music Video)',
    ),
    'Prince and the Revolution',
  );
  assert.equal(parseLeadArtistFromYoutubeTitle('No hyphen here'), null);

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
