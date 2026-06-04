import assert from 'node:assert/strict';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';
import {
  expandLibrarySearchQueryVariants,
  expandMainArtistNamesForLibraryFilter,
  songMainArtistIncludesArtist,
} from '@/lib/library-search-query';

function run() {
  const v1 = expandLibrarySearchQueryVariants('テイラー・スウィフト');
  assert.ok(v1.includes('テイラー・スウィフト'));
  assert.ok(v1.includes('テイラースウィフト'));
  assert.ok(v1.includes('Taylor Swift'));

  const v2 = expandLibrarySearchQueryVariants('テイラースイフト');
  assert.ok(v2.includes('テイラースイフト'));
  assert.ok(v2.some((x) => x.includes('スウィ') || x === 'Taylor Swift'));

  const v3 = expandLibrarySearchQueryVariants('テイラー スウィフト');
  assert.ok(v3.includes('テイラースウィフト') || v3.includes('テイラー スウィフト'));

  const collab = expandMainArtistNamesForLibraryFilter('Lady Gaga, Bruno Mars');
  assert.ok(collab.includes('Lady Gaga, Bruno Mars'));
  assert.ok(collab.includes('Lady Gaga'));
  assert.ok(collab.includes('Bruno Mars'));

  assert.equal(songMainArtistIncludesArtist('Lady Gaga, Bruno Mars', 'Bruno Mars'), true);
  assert.equal(songMainArtistIncludesArtist('Lady Gaga, Bruno Mars', 'Lady Gaga'), true);
  assert.equal(songMainArtistIncludesArtist('Lady Gaga, Bruno Mars', 'Lady Gaga, Bruno Mars'), true);
  assert.equal(songMainArtistIncludesArtist('Bruno Mars', 'Bruno Mars'), true);
  assert.equal(songMainArtistIncludesArtist('Bruno Mars', 'Mars'), false);
  assert.equal(songMainArtistIncludesArtist('Die With A Smile', 'Die'), false);

  const index = [
    { main_artist: 'Oasis' },
    { main_artist: 'The Beatles' },
    { main_artist: 'Lady Gaga, Bruno Mars' },
  ];
  assert.equal(findLibraryMainArtistInIndex(['Oasis'], index), 'Oasis');
  assert.equal(findLibraryMainArtistInIndex(['Beatles'], index), 'The Beatles');
  assert.equal(findLibraryMainArtistInIndex(['Bruno Mars'], index), 'Lady Gaga, Bruno Mars');

  console.log('library-search-query.unit-test: ok');
}

run();
