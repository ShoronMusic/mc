/**
 * npx tsx src/lib/admin-song-spotify-by-track-id.unit-test.ts
 */
import assert from 'node:assert/strict';
import { buildOverwriteSpotifySongPayload } from '@/lib/admin-song-spotify-by-track-id';
import { parseSpotifyTrackIdInput } from '@/lib/spotify-search-track';

assert.equal(parseSpotifyTrackIdInput('  5QO79kh1waicV47BqGRL3g  '), '5QO79kh1waicV47BqGRL3g');

const payload = buildOverwriteSpotifySongPayload({
  songTitle: 'Save Your Tears',
  currentMainArtist: 'The Weeknd',
  currentDisplayTitle: 'The Weeknd - Save Your Tears',
  meta: {
    spotifyTrackId: '5QO79kh1waicV47BqGRL3g',
    spotifyPopularity: 91,
    spotifyName: 'Save Your Tears',
    spotifyArtists: 'The Weeknd, Ariana Grande',
    spotifyReleaseDate: '2020-03-20',
    spotifyImages: 'https://i.scdn.co/image/x',
  },
  trackArtistNames: ['The Weeknd', 'Ariana Grande'],
});

assert.ok(payload);
assert.equal(payload.spotify_track_id, '5QO79kh1waicV47BqGRL3g');
assert.equal(payload.spotify_popularity, 91);
assert.equal(payload.spotify_artists, 'The Weeknd, Ariana Grande');
assert.equal(payload.main_artist, 'The Weeknd, Ariana Grande');
assert.equal(payload.display_title, 'The Weeknd, Ariana Grande - Save Your Tears');

assert.equal(
  buildOverwriteSpotifySongPayload({
    songTitle: 'X',
    currentMainArtist: 'A',
    currentDisplayTitle: 'A - X',
    meta: {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
      spotifyImages: null,
    },
  }),
  null,
);

console.log('admin-song-spotify-by-track-id.unit-test: ok');
