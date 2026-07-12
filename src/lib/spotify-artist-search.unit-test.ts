import assert from 'node:assert/strict';
import { pickSpotifyArtistImageUrl } from '@/lib/spotify-search-track';

assert.equal(
  pickSpotifyArtistImageUrl([
    { url: 'https://i.scdn.co/image/ab6761610000e5ebabc', height: 640 },
    { url: 'https://i.scdn.co/image/ab67616100005174abc', height: 64 },
  ]),
  'https://i.scdn.co/image/ab67616100005174abc',
);

assert.equal(
  pickSpotifyArtistImageUrl([
    { url: 'https://i.scdn.co/image/large', height: 640, width: 640 },
    { url: 'https://i.scdn.co/image/medium', height: 320, width: 320 },
    { url: 'https://i.scdn.co/image/small', height: 64, width: 64 },
  ]),
  'https://i.scdn.co/image/small',
);

assert.equal(
  pickSpotifyArtistImageUrl([
    { url: 'https://i.scdn.co/image/large' },
    { url: 'https://i.scdn.co/image/small' },
  ]),
  'https://i.scdn.co/image/small',
);

console.log('spotify-artist-search.unit-test: ok');
