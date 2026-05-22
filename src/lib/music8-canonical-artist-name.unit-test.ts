import assert from 'node:assert/strict';
import {
  artistNameMatchKey,
  buildSongDisplayTitle,
  canonicalNameFromMusic8ArtistJson,
  isPrefixOnlyArtistNameVariant,
  music8ArtistSlugFromPersistedSnapshot,
  pickCanonicalFromPrefixVariants,
  primaryArtistNameFromMusic8Snapshot,
  shouldNormalizePrefixOnlyArtistName,
} from '@/lib/music8-canonical-artist-name';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';

function run() {
  assert.equal(artistNameMatchKey('The Police'), artistNameMatchKey('Police'));
  assert.equal(isPrefixOnlyArtistNameVariant(['The Police', 'Police']), true);
  assert.equal(isPrefixOnlyArtistNameVariant(['Bruno Mars', 'Ed Sheeran']), false);

  const police = canonicalNameFromMusic8ArtistJson({
    name: 'Police',
    thePrefix: 'The',
  });
  assert.equal(police, 'The Police');

  assert.equal(buildSongDisplayTitle('The Police', 'Roxanne'), 'The Police - Roxanne');
  assert.equal(pickCanonicalFromPrefixVariants(['Police', 'The Police']), 'The Police');
  assert.equal(pickCanonicalFromPrefixVariants(['abel york', 'Abel York']), 'Abel York');
  assert.equal(shouldNormalizePrefixOnlyArtistName('Police', 'The Police'), true);
  assert.equal(shouldNormalizePrefixOnlyArtistName('Abel York', 'abel york'), false);

  assert.equal(artistNameToMusic8Slug('The Police'), 'police');
  assert.equal(artistNameToMusic8Slug('The Dillio Twins'), 'dillio-twins');
  assert.equal(
    primaryArtistNameFromMusic8Snapshot({
      display: { primary_artist_name: 'The Police' },
      stable_key: { artist_slug: 'police', song_slug: 'roxanne' },
    }),
    'The Police',
  );
  assert.equal(
    music8ArtistSlugFromPersistedSnapshot({
      stable_key: { artist_slug: 'police', song_slug: 'roxanne' },
    }),
    'police',
  );

  console.log('music8-canonical-artist-name.unit-test: ok');
}

run();
