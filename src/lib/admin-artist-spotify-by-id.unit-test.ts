/**
 * npx tsx src/lib/admin-artist-spotify-by-id.unit-test.ts
 */
import assert from 'node:assert/strict';
import { buildOverwriteSpotifyArtistPayload } from '@/lib/admin-artist-spotify-by-id';
import { parseSpotifyArtistIdInput } from '@/lib/spotify-search-track';

assert.equal(parseSpotifyArtistIdInput('  66CXWjxzNUsdJxJ2JdwvnR  '), '66CXWjxzNUsdJxJ2JdwvnR');

const payload = buildOverwriteSpotifyArtistPayload(
  {
    id: '66CXWjxzNUsdJxJ2JdwvnR',
    name: 'Ariana Grande',
    popularity: 94,
    images: 'https://i.scdn.co/image/x',
  },
  { imageUrl: null },
);

assert.equal(payload.spotify_artist_id, '66CXWjxzNUsdJxJ2JdwvnR');
assert.equal(payload.spotify_artist_popularity, 94);
assert.equal(payload.spotify_artist_images, 'https://i.scdn.co/image/x');
assert.equal(payload.image_url, 'https://i.scdn.co/image/x');
assert.equal(payload.name_en, 'Ariana Grande');

const keepImage = buildOverwriteSpotifyArtistPayload(
  {
    id: '66CXWjxzNUsdJxJ2JdwvnR',
    name: 'Ariana Grande',
    popularity: 90,
    images: 'https://i.scdn.co/image/new',
  },
  { imageUrl: 'https://example.com/kept.jpg' },
);
assert.equal(keepImage.image_url, undefined);
assert.equal(keepImage.spotify_artist_images, 'https://i.scdn.co/image/new');

console.log('admin-artist-spotify-by-id.unit-test: ok');
