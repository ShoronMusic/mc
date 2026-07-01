import assert from 'node:assert/strict';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';
import {
  expandLibrarySearchQueryVariants,
  expandMainArtistNamesForLibraryFilter,
  primaryArtistForLibraryIndex,
  songMainArtistIncludesArtist,
  dedupeLibraryArtistDisplayNames,
  mergeLibraryArtistIndexItems,
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
  assert.equal(songMainArtistIncludesArtist('The Beatles', 'Beatles'), true);
  assert.equal(songMainArtistIncludesArtist('Beatles', 'The Beatles'), true);

  assert.equal(primaryArtistForLibraryIndex('Calvin Harris'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Calvin Harris, Dua Lipa'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Calvin Harris, Disciples'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Lady Gaga & Bruno Mars'), 'Lady Gaga');

  const index = [
    { main_artist: 'Oasis' },
    { main_artist: 'The Beatles' },
    { main_artist: 'Lady Gaga, Bruno Mars' },
  ];
  assert.equal(findLibraryMainArtistInIndex(['Oasis'], index), 'Oasis');
  assert.equal(findLibraryMainArtistInIndex(['Beatles'], index), 'The Beatles');
  assert.equal(findLibraryMainArtistInIndex(['Bruno Mars'], index), 'Lady Gaga, Bruno Mars');

  assert.deepEqual(dedupeLibraryArtistDisplayNames(['Beatles', 'The Beatles']), ['The Beatles']);
  assert.deepEqual(
    mergeLibraryArtistIndexItems([
      { main_artist: 'Beatles', count: 3, indexLetter: 'B' },
      { main_artist: 'The Beatles', count: 200, indexLetter: 'B' },
    ]),
    [{ main_artist: 'The Beatles', count: 203, indexLetter: 'B' }],
  );

  const vSmith = expandLibrarySearchQueryVariants('スミス');
  assert.ok(vSmith.includes('スミス'));
  assert.ok(vSmith.includes('The Smiths'));
  const vSmithsJa = expandLibrarySearchQueryVariants('ザ・スミス');
  assert.ok(vSmithsJa.includes('The Smiths'));
  const vBeatles = expandLibrarySearchQueryVariants('ビートルズ');
  assert.ok(vBeatles.includes('The Beatles'));

  console.log('library-search-query.unit-test: ok');
}

run();
