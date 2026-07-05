import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMENT_PACK_NEW_RELEASE_DAYS,
  extractLegacyReleaseYearFromYoutubeDescription,
  isYoutubeVideoPublishedWithinLastDays,
  shouldApplyCommentPackNewReleaseMode,
} from '@/lib/comment-pack-new-release';

test('isYoutubeVideoPublishedWithinLastDays respects threshold', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const recent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isYoutubeVideoPublishedWithinLastDays(recent, COMMENT_PACK_NEW_RELEASE_DAYS), true);
  assert.equal(isYoutubeVideoPublishedWithinLastDays(old, COMMENT_PACK_NEW_RELEASE_DAYS), false);
});

test('extractLegacyReleaseYearFromYoutubeDescription finds release year in official re-upload text', () => {
  const desc =
    'Featuring archival video footage sourced from a 1972 show. Released in 1972 on the album Chicago V.';
  assert.equal(extractLegacyReleaseYearFromYoutubeDescription(desc), 1972);
});

test('shouldApplyCommentPackNewReleaseMode skips catalog when Music8 has original release date', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const recentYt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const apply = shouldApplyCommentPackNewReleaseMode({
    youtubePublishedAt: recentYt,
    musicaichatSong: {
      stable_key: { artist_slug: 'chicago', song_slug: 'saturday-in-the-park' },
      releases: { original_release_date: '1972-07-01' },
    },
    now,
  });
  assert.equal(apply, false);
});

test('shouldApplyCommentPackNewReleaseMode skips catalog when description states legacy year', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const recentYt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const apply = shouldApplyCommentPackNewReleaseMode({
    youtubePublishedAt: recentYt,
    youtubeDescription: 'Released in 1972 on the album Chicago V.',
    now,
  });
  assert.equal(apply, false);
});

test('shouldApplyCommentPackNewReleaseMode keeps mode for genuinely recent releases', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const recentYt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const apply = shouldApplyCommentPackNewReleaseMode({
    youtubePublishedAt: recentYt,
    youtubeDescription: 'Brand new single out now.',
    now,
  });
  assert.equal(apply, true);
});
