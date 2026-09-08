/**
 * `npx tsx src/lib/song-display-from-spotify-artists.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { planSongDisplayFromSpotifyArtists } from '@/lib/song-display-from-spotify-artists';

assert.deepEqual(
  planSongDisplayFromSpotifyArtists({
    songTitle: 'Still',
    spotifyArtists: 'KAROL G, Bruno Mars',
    currentMainArtist: 'Karol G',
    currentDisplayTitle: 'Karol G - Still',
  }),
  {
    mainArtist: 'KAROL G, Bruno Mars',
    displayTitle: 'KAROL G, Bruno Mars - Still',
  },
);

assert.equal(
  planSongDisplayFromSpotifyArtists({
    songTitle: 'Still',
    spotifyArtists: 'KAROL G, Bruno Mars',
    currentMainArtist: 'KAROL G, Bruno Mars',
    currentDisplayTitle: 'KAROL G, Bruno Mars - Still',
  }),
  null,
);

assert.deepEqual(
  planSongDisplayFromSpotifyArtists({
    songTitle: 'Still',
    spotifyArtists: 'Bruno Mars, KAROL G',
    trackArtistNames: ['KAROL G', 'Bruno Mars'],
    currentMainArtist: 'Bruno Mars, KAROL G',
    currentDisplayTitle: 'Bruno Mars, KAROL G - Still',
  }),
  {
    mainArtist: 'KAROL G, Bruno Mars',
    displayTitle: 'KAROL G, Bruno Mars - Still',
  },
);

assert.equal(
  planSongDisplayFromSpotifyArtists({
    songTitle: 'Still',
    spotifyArtists: null,
    currentMainArtist: 'Karol G',
  }),
  null,
);

console.log('song-display-from-spotify-artists.unit-test: ok');
