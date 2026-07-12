import {
  filterSongRowsByLibraryCatalog,
  inferSongCatalogScopeFromSongRow,
  parseLibraryCatalogFilter,
  resolveSongCatalogScope,
  songRowMatchesLibraryCatalogFilter,
} from './song-catalog-scope';
import {
  resetDomesticJpArtistCacheForTests,
  setDomesticJpArtistKeysForTests,
} from './domestic-jp-artists';
import {
  resetWesternTreatedJpArtistCacheForTests,
  setWesternTreatedJpArtistKeysForTests,
} from './western-treated-jp-artists';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(parseLibraryCatalogFilter('western') === 'western', 'western');
assert(parseLibraryCatalogFilter('jp') === 'domestic', 'jp alias');
assert(parseLibraryCatalogFilter('both') === 'all', 'both alias');
assert(parseLibraryCatalogFilter(null, 'domestic') === 'domestic', 'default');

assert(
  inferSongCatalogScopeFromSongRow({
    main_artist: 'Official髭男dism',
    song_title: 'Pretender',
    display_title: 'Official髭男dism - Pretender',
  }) === 'domestic',
  'jp artist domestic',
);

assert(
  inferSongCatalogScopeFromSongRow({
    main_artist: 'The Beatles',
    song_title: 'Hey Jude',
    display_title: 'The Beatles - Hey Jude',
    artist_origin_country: 'UK',
  }) === 'western',
  'western latin',
);

assert(
  resolveSongCatalogScope({ isJapaneseEconomy: true, mainArtist: 'X', songTitle: 'Y' }) === 'domestic',
  'jp economy',
);

resetWesternTreatedJpArtistCacheForTests();
setWesternTreatedJpArtistKeysForTests(['ado']);
assert(
  resolveSongCatalogScope({
    isJapaneseEconomy: true,
    mainArtist: 'Ado',
    songTitle: '【Ado】踊',
  }) === 'western',
  'western-treated overrides jp economy',
);

resetDomesticJpArtistCacheForTests();
setDomesticJpArtistKeysForTests(['mrchildren']);
assert(
  resolveSongCatalogScope({
    mainArtist: 'Mr.Children',
    songTitle: 'Tomorrow never knows',
    displayTitle: 'Mr.Children - Tomorrow never knows',
  }) === 'domestic',
  'domestic-jp artist forces domestic scope',
);
assert(
  inferSongCatalogScopeFromSongRow({
    main_artist: 'Mr.Children',
    song_title: 'Tomorrow never knows',
    display_title: 'Mr.Children - Tomorrow never knows',
  }) === 'domestic',
  'infer domestic from list',
);

const rowWestern = {
  catalog_scope: 'western' as const,
  main_artist: 'A',
  song_title: 'B',
  display_title: 'A - B',
};
const rowDomestic = {
  catalog_scope: 'domestic' as const,
  main_artist: 'あ',
  song_title: '曲',
  display_title: 'あ - 曲',
};

assert(songRowMatchesLibraryCatalogFilter(rowWestern, 'western'), 'scope western in western');
assert(
  !songRowMatchesLibraryCatalogFilter(rowWestern, 'domestic'),
  'scope western not in domestic',
);

resetWesternTreatedJpArtistCacheForTests();
setWesternTreatedJpArtistKeysForTests(['fujiikaze']);
const rowFujiiWestern = {
  catalog_scope: 'western' as const,
  main_artist: 'Fujii Kaze',
  song_title: 'Michiteyuku',
  display_title: 'Fujii Kaze - Michiteyuku',
};
const rowFujiiDomesticMeta = {
  catalog_scope: 'domestic' as const,
  main_artist: '藤井 風',
  song_title: '満ちてゆく',
  display_title: '藤井 風 - 満ちてゆく',
  music8_artist_slug: 'fujiikaze',
};
assert(
  songRowMatchesLibraryCatalogFilter(rowFujiiWestern, 'western') &&
    songRowMatchesLibraryCatalogFilter(rowFujiiWestern, 'domestic'),
  'western-treated by name in both catalogs',
);
assert(
  songRowMatchesLibraryCatalogFilter(rowFujiiDomesticMeta, 'western') &&
    songRowMatchesLibraryCatalogFilter(rowFujiiDomesticMeta, 'domestic'),
  'western-treated by slug in both catalogs',
);

assert(songRowMatchesLibraryCatalogFilter(rowDomestic, 'all'), 'all includes domestic scope');
assert(filterSongRowsByLibraryCatalog([rowWestern, rowDomestic], 'western').length === 1, 'filter western');

console.log('song-catalog-scope.unit-test.ts: ok');
