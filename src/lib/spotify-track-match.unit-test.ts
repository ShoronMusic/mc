/**
 * npx tsx src/lib/spotify-track-match.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  isSpotifyRejectListed,
  pickBestSpotifyCandidate,
  scoreSpotifyTrackCandidate,
  type SpotifyTrackCandidate,
} from '@/lib/spotify-track-match';

assert.equal(isSpotifyRejectListed(['The Hit Co.'], 'Girls of Summer'), 'reject_artist_pattern');
assert.equal(
  isSpotifyRejectListed(['Backing Business'], 'Interstellar - Karaoke Version'),
  'reject_artist_pattern',
);
assert.equal(
  isSpotifyRejectListed(['Some Artist'], 'Interstellar - Karaoke Version Originally Performed by X'),
  'reject_title_pattern',
);

const aerosmithOk: SpotifyTrackCandidate = {
  spotifyTrackId: 'real',
  spotifyName: 'Girls of Summer',
  spotifyArtists: 'Aerosmith',
  artistRefs: [{ id: '1', name: 'Aerosmith' }],
  popularity: 45,
};

const d = scoreSpotifyTrackCandidate(aerosmithOk, 'Aerosmith', 'Girls Of Summer');
assert.equal(d.action, 'apply');

const tribute: SpotifyTrackCandidate = {
  spotifyTrackId: 'bad',
  spotifyName: 'Girls of Summer',
  spotifyArtists: 'The Hit Co., The Tribute Co.',
  artistRefs: [
    { id: 'h', name: 'The Hit Co.' },
    { id: 't', name: 'The Tribute Co.' },
  ],
  popularity: 10,
};

const d2 = scoreSpotifyTrackCandidate(tribute, 'Aerosmith', 'Girls Of Summer');
assert.equal(d2.action, 'review');

const picked = pickBestSpotifyCandidate(
  [tribute, aerosmithOk],
  'Aerosmith',
  'Girls Of Summer',
);
assert.equal(picked.decision.action, 'apply');
assert.equal(picked.best?.spotifyTrackId, 'real');

console.log('spotify-track-match.unit-test: ok');
