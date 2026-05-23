import assert from 'node:assert/strict';
import { parseArtistTitleFromDisplayTitle } from '@/lib/spotify-search-track';

function run() {
  assert.deepEqual(parseArtistTitleFromDisplayTitle('The Beatles - Let It Be'), {
    artist: 'The Beatles',
    title: 'Let It Be',
  });
  assert.equal(parseArtistTitleFromDisplayTitle('Let It Be'), null);
  console.log('spotify-search-track.unit-test: ok');
}

run();
