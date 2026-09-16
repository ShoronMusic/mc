/**
 * npx tsx src/lib/admin-song-spotify-by-track-id.unit-test.ts
 */
import assert from 'node:assert/strict';
import { buildClearSpotifySongPayload, buildOverwriteSpotifySongPayload, songHasResettableSpotifyMeta, stripSpotifyTrackIdFromMusic8SongData } from '@/lib/admin-song-spotify-by-track-id';
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

assert.deepEqual(buildClearSpotifySongPayload(), {
  spotify_track_id: null,
  spotify_name: null,
  spotify_artists: null,
  spotify_release_date: null,
  spotify_popularity: null,
  spotify_images: null,
});
assert.equal(Object.prototype.hasOwnProperty.call(buildClearSpotifySongPayload(), 'main_artist'), false);
assert.equal(Object.prototype.hasOwnProperty.call(buildClearSpotifySongPayload(), 'display_title'), false);

assert.equal(
  songHasResettableSpotifyMeta({ spotify_track_id: '5QO79kh1waicV47BqGRL3g' }),
  true,
);
assert.equal(songHasResettableSpotifyMeta({ spotify_popularity: 40 }), true);
assert.equal(songHasResettableSpotifyMeta({}), false);

const strippedSnap = stripSpotifyTrackIdFromMusic8SongData({
  kind: 'musicaichat_v1',
  spotify_track_id: 'abc',
  identifiers: { spotify_track_id: 'abc', music8_song_id: 12 },
});
assert.ok(strippedSnap && typeof strippedSnap === 'object');
assert.equal((strippedSnap as { spotify_track_id?: string }).spotify_track_id, undefined);
assert.equal(
  (strippedSnap as { identifiers?: { spotify_track_id?: string; music8_song_id?: number } }).identifiers
    ?.spotify_track_id,
  undefined,
);
assert.equal(
  (strippedSnap as { identifiers?: { music8_song_id?: number } }).identifiers?.music8_song_id,
  12,
);
assert.equal(stripSpotifyTrackIdFromMusic8SongData(null), null);

console.log('admin-song-spotify-by-track-id.unit-test: ok');
