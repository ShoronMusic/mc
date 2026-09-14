import assert from 'node:assert/strict';
import {
  parseArtistTitleFromDisplayTitle,
  parseSpotifyArtistIdInput,
  parseSpotifyTrackIdInput,
} from '@/lib/spotify-search-track';

function run() {
  assert.deepEqual(parseArtistTitleFromDisplayTitle('The Beatles - Let It Be'), {
    artist: 'The Beatles',
    title: 'Let It Be',
  });
  assert.equal(parseArtistTitleFromDisplayTitle('Let It Be'), null);

  assert.equal(parseSpotifyTrackIdInput('5QO79kh1waicV47BqGRL3g'), '5QO79kh1waicV47BqGRL3g');
  assert.equal(
    parseSpotifyTrackIdInput('https://open.spotify.com/track/5QO79kh1waicV47BqGRL3g?si=abc'),
    '5QO79kh1waicV47BqGRL3g',
  );
  assert.equal(
    parseSpotifyTrackIdInput('https://open.spotify.com/intl-ja/track/5QO79kh1waicV47BqGRL3g'),
    '5QO79kh1waicV47BqGRL3g',
  );
  assert.equal(parseSpotifyTrackIdInput('spotify:track:5QO79kh1waicV47BqGRL3g'), '5QO79kh1waicV47BqGRL3g');
  assert.equal(parseSpotifyTrackIdInput('https://open.spotify.com/album/abc'), null);
  assert.equal(parseSpotifyTrackIdInput(''), null);

  assert.equal(parseSpotifyArtistIdInput('66CXWjxzNUsdJxJ2JdwvnR'), '66CXWjxzNUsdJxJ2JdwvnR');
  assert.equal(
    parseSpotifyArtistIdInput('https://open.spotify.com/artist/66CXWjxzNUsdJxJ2JdwvnR?si=x'),
    '66CXWjxzNUsdJxJ2JdwvnR',
  );
  assert.equal(parseSpotifyArtistIdInput('spotify:artist:66CXWjxzNUsdJxJ2JdwvnR'), '66CXWjxzNUsdJxJ2JdwvnR');
  assert.equal(
    parseSpotifyArtistIdInput('https://open.spotify.com/intl-ja/artist/66CXWjxzNUsdJxJ2JdwvnR'),
    '66CXWjxzNUsdJxJ2JdwvnR',
  );
  assert.equal(parseSpotifyArtistIdInput('https://open.spotify.com/track/5QO79kh1waicV47BqGRL3g'), null);

  console.log('spotify-search-track.unit-test: ok');
}

run();
