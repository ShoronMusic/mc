import assert from 'node:assert/strict';
import {
  COMMENT_PACK_FREE_STAGGER_IDEAL_MS,
  COMMENT_PACK_FREE_STAGGER_MIN_MS,
  getPostCommentaryFixedTailMs,
  getPostCommentaryQuizDisplayDelayMs,
  getPostCommentaryRecommendDisplayDelayMs,
  POST_COMMENTARY_QUIZ_GAP_MS,
  POST_QUIZ_RECOMMEND_GAP_MS,
  resolvePostCommentaryPace,
} from './post-commentary-followup-timing';

assert.equal(getPostCommentaryQuizDisplayDelayMs(0, 30_000), POST_COMMENTARY_QUIZ_GAP_MS);
assert.equal(getPostCommentaryQuizDisplayDelayMs(3, 30_000), 3 * 30_000 + POST_COMMENTARY_QUIZ_GAP_MS);

assert.equal(
  getPostCommentaryRecommendDisplayDelayMs({
    quizWillShow: true,
    quizDisplayDelayMs: 93500,
  }),
  93500 + POST_QUIZ_RECOMMEND_GAP_MS,
);
assert.equal(
  getPostCommentaryRecommendDisplayDelayMs({
    quizWillShow: false,
    quizDisplayDelayMs: 3500,
  }),
  3500,
);

const ideal = resolvePostCommentaryPace({
  remainingPlaybackMs: null,
  freeSlotCount: 3,
  quizEnabled: true,
  recommendEnabled: true,
  aiAgentParticipating: true,
});
assert.equal(ideal.freeStaggerMs, COMMENT_PACK_FREE_STAGGER_IDEAL_MS);
assert.equal(ideal.compressed, false);

/** 長い曲: 理想のまま */
const longSong = resolvePostCommentaryPace({
  remainingPlaybackMs: 6 * 60_000,
  freeSlotCount: 3,
  quizEnabled: true,
  recommendEnabled: true,
  aiAgentParticipating: true,
});
assert.equal(longSong.freeStaggerMs, COMMENT_PACK_FREE_STAGGER_IDEAL_MS);
assert.equal(longSong.compressed, false);

/** 短い曲: 間隔を縮める */
const shortSong = resolvePostCommentaryPace({
  remainingPlaybackMs: 90_000,
  freeSlotCount: 3,
  quizEnabled: true,
  recommendEnabled: true,
  aiAgentParticipating: false,
});
assert.ok(shortSong.freeStaggerMs < COMMENT_PACK_FREE_STAGGER_IDEAL_MS);
assert.ok(shortSong.freeStaggerMs >= COMMENT_PACK_FREE_STAGGER_MIN_MS);
assert.equal(shortSong.compressed, true);
assert.ok(
  shortSong.recommendDisplayDelayMs + 4000 <= 90_000 - 10_000 ||
    shortSong.freeStaggerMs === COMMENT_PACK_FREE_STAGGER_MIN_MS,
);

/** 極端に短い: MIN まで */
const tiny = resolvePostCommentaryPace({
  remainingPlaybackMs: 25_000,
  freeSlotCount: 3,
  quizEnabled: true,
  recommendEnabled: true,
  aiAgentParticipating: true,
});
assert.equal(tiny.freeStaggerMs, COMMENT_PACK_FREE_STAGGER_MIN_MS);
assert.equal(tiny.compressed, true);

assert.ok(getPostCommentaryFixedTailMs({ quizEnabled: true, recommendEnabled: true }) >
  getPostCommentaryFixedTailMs({ quizEnabled: false, recommendEnabled: false }));

console.log('post-commentary-followup-timing.unit-test.ts: ok');
