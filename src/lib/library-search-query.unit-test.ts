import assert from 'node:assert/strict';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';
import {
  expandLibrarySearchQueryVariants,
  expandMainArtistNamesForLibraryFilter,
  primaryArtistForLibraryIndex,
  songMainArtistIncludesArtist,
  dedupeLibraryArtistDisplayNames,
  compareLibrarySearchArtistRowsByCountDesc,
  mergeLibraryArtistIndexItems,
  pickCanonicalLibraryMainArtistName,
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
  // 登録時 Title Case と artists.name の大文字表記のゆれ（一覧 API の ILIKE と整合）
  assert.equal(songMainArtistIncludesArtist('Mrs. Green Apple', 'Mrs. GREEN APPLE'), true);
  assert.equal(songMainArtistIncludesArtist('Bruno Mars', 'Mars'), false);
  assert.equal(songMainArtistIncludesArtist('Die With A Smile', 'Die'), false);
  assert.equal(songMainArtistIncludesArtist('The Beatles', 'Beatles'), true);
  assert.equal(songMainArtistIncludesArtist('Beatles', 'The Beatles'), true);

  assert.equal(primaryArtistForLibraryIndex('Calvin Harris'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Calvin Harris, Dua Lipa'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Calvin Harris, Disciples'), 'Calvin Harris');
  assert.equal(primaryArtistForLibraryIndex('Lady Gaga & Bruno Mars'), 'Lady Gaga');
  // 分離しないアーティスト（カンマ＋The を維持）
  assert.equal(primaryArtistForLibraryIndex('Tyler, The Creator'), 'Tyler, The Creator');
  assert.equal(primaryArtistForLibraryIndex('Tyler, the Creator'), 'Tyler, The Creator');

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

  const sortedSearchArtists = [
    { main_artist: 'Aminé', count: 1 },
    { main_artist: 'Prince', count: 68 },
    { main_artist: 'King Princess', count: 3 },
    { main_artist: 'Apollonia', count: 1 },
  ].sort(compareLibrarySearchArtistRowsByCountDesc);
  assert.deepEqual(
    sortedSearchArtists.map((a) => a.main_artist),
    ['Prince', 'King Princess', 'Aminé', 'Apollonia'],
  );

  const vSmith = expandLibrarySearchQueryVariants('スミス');
  assert.ok(vSmith.includes('スミス'));
  assert.ok(vSmith.includes('The Smiths'));
  const vSmithsJa = expandLibrarySearchQueryVariants('ザ・スミス');
  assert.ok(vSmithsJa.includes('The Smiths'));
  const vBeatles = expandLibrarySearchQueryVariants('ビートルズ');
  assert.ok(vBeatles.includes('The Beatles'));

  const vDct = expandLibrarySearchQueryVariants('ドリカム');
  assert.ok(vDct.includes('ドリカム'));
  assert.ok(vDct.includes('Dreams Come True'));
  assert.ok(vDct.some((x) => /ドリームズ/.test(x)));

  // artists.name に曲名が入っているケース: credits 先の支配的 main_artist へ寄せる
  assert.equal(
    pickCanonicalLibraryMainArtistName(
      'Billie Jean',
      new Map([
        ['Michael Jackson', 48],
        ['Billie Jean', 1],
      ]),
    ),
    'Michael Jackson',
  );
  assert.equal(
    pickCanonicalLibraryMainArtistName(
      'Faith',
      new Map([['George Michael', 27]]),
    ),
    'George Michael',
  );
  // 本人の曲が十分あるときは差し替えない
  assert.equal(
    pickCanonicalLibraryMainArtistName(
      'Michael Monroe',
      new Map([
        ['Michael Monroe', 14],
        ['Hanoi Rocks', 2],
      ]),
    ),
    'Michael Monroe',
  );
  assert.equal(
    pickCanonicalLibraryMainArtistName('Unknown Solo', new Map()),
    'Unknown Solo',
  );

  console.log('library-search-query.unit-test: ok');
}

run();
