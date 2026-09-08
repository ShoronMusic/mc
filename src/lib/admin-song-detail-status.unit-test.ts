/**
 * `npx tsx src/lib/admin-song-detail-status.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  isAdminSongBasicInfoFilled,
  isAdminSongIntroFilled,
  isAdminSongSpotifyFilled,
} from '@/lib/admin-song-detail-status';

assert.equal(
  isAdminSongBasicInfoFilled({ style: 'Pop', vocal: 'F', originalReleaseDate: '2016-03-11' }),
  true,
);
assert.equal(
  isAdminSongBasicInfoFilled({ style: 'Pop', vocal: '', originalReleaseDate: '2016-03-11' }),
  false,
);
assert.equal(isAdminSongIntroFilled('短い'), false);
assert.equal(isAdminSongIntroFilled('あ'.repeat(24)), true);
assert.equal(isAdminSongSpotifyFilled({ hasTrackId: true, hasPopularity: true }), true);
assert.equal(isAdminSongSpotifyFilled({ hasTrackId: true, hasPopularity: false }), false);

console.log('admin-song-detail-status.unit-test: ok');
