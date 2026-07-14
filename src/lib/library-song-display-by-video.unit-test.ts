import assert from 'node:assert/strict';
import {
  buildLibrarySongAnnounceTitle,
  librarySongToPlaybackDisplayOverride,
  preferPlaybackDisplaySources,
  type LibrarySongDisplay,
} from '@/lib/library-song-display-by-video';

const sample: LibrarySongDisplay = {
  songId: 'song-1',
  displayTitle: 'Mrs. GREEN APPLE - 僕のこと',
  mainArtist: 'Mrs. GREEN APPLE',
  songTitle: '僕のこと',
  originalReleaseDate: '2018-01-01',
};

assert.equal(buildLibrarySongAnnounceTitle(sample), 'Mrs. GREEN APPLE - 僕のこと');
assert.equal(
  buildLibrarySongAnnounceTitle({
    songId: 'x',
    displayTitle: '',
    mainArtist: 'A',
    songTitle: 'B',
    originalReleaseDate: null,
  }),
  'A - B',
);

assert.deepEqual(librarySongToPlaybackDisplayOverride(sample), {
  title: 'Mrs. GREEN APPLE - 僕のこと',
  artist_name: 'Mrs. GREEN APPLE',
});

assert.deepEqual(
  preferPlaybackDisplaySources({
    adminOverride: { title: 'Admin Fix - Song', artist_name: 'Admin' },
    library: sample,
  }),
  { title: 'Admin Fix - Song', artist_name: 'Admin' },
);

assert.deepEqual(
  preferPlaybackDisplaySources({
    adminOverride: null,
    library: sample,
    hint: { title: 'Hint - Song', artist_name: 'Hint' },
  }),
  { title: 'Mrs. GREEN APPLE - 僕のこと', artist_name: 'Mrs. GREEN APPLE' },
);

assert.deepEqual(
  preferPlaybackDisplaySources({
    adminOverride: null,
    library: null,
    hint: { title: 'Hint - Song', artist_name: 'Hint' },
  }),
  { title: 'Hint - Song', artist_name: 'Hint' },
);

console.log('library-song-display-by-video.unit-test: ok');
