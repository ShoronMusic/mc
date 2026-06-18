import assert from 'node:assert/strict';
import { isLibraryArtistInfoSparse } from '@/lib/library-artist-info-display';

function run() {
  assert.equal(isLibraryArtistInfoSparse(null), true);
  assert.equal(
    isLibraryArtistInfoSparse({ image_url: null, profile_text: null }),
    true,
  );
  assert.equal(
    isLibraryArtistInfoSparse({
      profile_text: 'Scottish DJ and producer.',
    }),
    false,
  );
  assert.equal(
    isLibraryArtistInfoSparse({
      origin_country: 'UK',
    }),
    false,
  );

  console.log('library-artist-info-display.unit-test: ok');
}

run();
