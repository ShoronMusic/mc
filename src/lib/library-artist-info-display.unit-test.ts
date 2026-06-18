import assert from 'node:assert/strict';
import { isLibraryArtistInfoSparse } from '@/lib/library-artist-info-display';

function run() {
  assert.equal(isLibraryArtistInfoSparse(null), true);
  assert.equal(
    isLibraryArtistInfoSparse({ name: 'Calvin Harris', image_url: null, profile_text: null }),
    true,
  );
  assert.equal(
    isLibraryArtistInfoSparse({
      name: 'Calvin Harris',
      profile_text: 'Scottish DJ and producer.',
    }),
    false,
  );
  assert.equal(
    isLibraryArtistInfoSparse({
      name: 'Oasis',
      origin_country: 'UK',
    }),
    false,
  );

  console.log('library-artist-info-display.unit-test: ok');
}

run();
