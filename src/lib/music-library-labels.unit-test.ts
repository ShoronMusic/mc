/**
 * `npx tsx src/lib/music-library-labels.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  formatMusicLibraryActivePeriod,
  formatMusicLibraryAgeParen,
  formatMusicLibraryOccupation,
  formatMusicLibraryOriginLabel,
  formatMusicLibraryYearMonth,
  groupMusicLibrarySongsByYear,
  musicLibraryActiveStartYear,
  musicLibraryArtistNameFromRow,
  musicLibraryReleaseYear,
  musicLibraryVocalLabels,
  listMusicLibraryGenreLinks,
  parseMusicLibraryGenresColumn,
  parseMusicLibrarySnapshotArtists,
  pickMusicLibraryGenreLabel,
  resolveMusicLibraryArtistDisplayName,
} from '@/lib/music-library-labels';

assert.equal(formatMusicLibraryYearMonth('2026-09-14'), '2026.09');
assert.equal(formatMusicLibraryYearMonth('1983-05-20'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('1983.05'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('1983/5'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('2026'), '2026');
assert.equal(formatMusicLibraryYearMonth(null), null);
assert.equal(formatMusicLibraryYearMonth(''), null);
assert.equal(formatMusicLibraryYearMonth('tba'), null);

assert.equal(musicLibraryReleaseYear('2026-09-14'), '2026');
assert.equal(musicLibraryReleaseYear('1983.05'), '1983');
assert.equal(musicLibraryReleaseYear('2026'), '2026');
assert.equal(musicLibraryReleaseYear(null), null);
assert.deepEqual(
  groupMusicLibrarySongsByYear([
    { releaseDate: '2024-12-01' },
    { releaseDate: '2024-08-01' },
    { releaseDate: '2020-04-01' },
    { releaseDate: null },
  ]).map((g) => ({ year: g.year, n: g.songs.length })),
  [
    { year: '2024', n: 2 },
    { year: '2020', n: 1 },
    { year: null, n: 1 },
  ],
);

assert.equal(formatMusicLibraryAgeParen('78歳'), '(78)');
assert.equal(formatMusicLibraryAgeParen('享年63歳'), '(享年63)');
assert.equal(formatMusicLibraryAgeParen(null), null);

assert.equal(formatMusicLibraryActivePeriod('2001 - -'), '2001 -');
assert.equal(formatMusicLibraryActivePeriod('2001 -'), '2001 -');
assert.equal(formatMusicLibraryActivePeriod('1977 - 1986'), '1977 - 1986');
assert.equal(formatMusicLibraryActivePeriod('1966 - '), '1966 -');
assert.equal(formatMusicLibraryActivePeriod(null), null);
assert.equal(musicLibraryActiveStartYear('2013 -'), 2013);
assert.equal(musicLibraryActiveStartYear('1977 - 1986'), 1977);
assert.equal(musicLibraryActiveStartYear(null), null);

assert.equal(formatMusicLibraryOccupation('band'), 'Band');
assert.equal(formatMusicLibraryOccupation('singer, songwriter'), 'Singer, Songwriter');
assert.equal(formatMusicLibraryOccupation('Band', ['singer']), 'Singer');
assert.equal(formatMusicLibraryOccupation('Singer'), 'Singer');
assert.equal(formatMusicLibraryOccupation(null, []), null);

assert.equal(formatMusicLibraryOriginLabel('UK'), 'UK');
assert.equal(formatMusicLibraryOriginLabel('GBR'), 'UK');
assert.equal(formatMusicLibraryOriginLabel('GBR（イギリス）'), 'UK');
assert.equal(formatMusicLibraryOriginLabel('USA'), 'US');
assert.equal(formatMusicLibraryOriginLabel('JPN'), 'JP');
assert.equal(formatMusicLibraryOriginLabel('UK / US'), 'UK');
assert.equal(formatMusicLibraryOriginLabel('SWE'), 'SWE');
assert.equal(formatMusicLibraryOriginLabel(null), null);
assert.equal(formatMusicLibraryOriginLabel('-'), null);

assert.deepEqual(parseMusicLibraryGenresColumn(['Pop-punk', ' Alternative ']), ['Pop-punk', 'Alternative']);
assert.deepEqual(parseMusicLibraryGenresColumn('Pop-punk, Dance-pop'), ['Pop-punk', 'Dance-pop']);

assert.equal(
  pickMusicLibraryGenreLabel({ columnGenres: ['Pop', 'R&B'] }),
  'Pop / R&B',
);
assert.equal(
  pickMusicLibraryGenreLabel({ columnGenres: ['Pop', 'Pop-punk'] }),
  'Pop / Pop-punk',
);
assert.equal(
  pickMusicLibraryGenreLabel({
    snapshotGenres: ['Pop-punk'],
    columnGenres: ['Pop'],
  }),
  'Pop-punk / Pop',
);
assert.equal(pickMusicLibraryGenreLabel({ columnGenres: ['Pop'] }), 'Pop');
assert.equal(pickMusicLibraryGenreLabel({ columnGenres: ['F', 'M'] }), null);
assert.equal(pickMusicLibraryGenreLabel({}), null);
assert.deepEqual(listMusicLibraryGenreLinks({ columnGenres: ['Pop', 'R&B'] }), [
  { name: 'Pop', slug: 'pop', href: '/music/genres/pop/1' },
  { name: 'R&B', slug: 'rb', href: '/music/genres/rb/1' },
]);
assert.deepEqual(listMusicLibraryGenreLinks({ columnGenres: ['Pop', 'Pop-punk'] }), [
  { name: 'Pop', slug: 'pop', href: '/music/genres/pop/1' },
  { name: 'Pop-punk', slug: 'pop-punk', href: '/music/genres/pop-punk/1' },
]);
assert.deepEqual(listMusicLibraryGenreLinks({ columnGenres: ['F', 'M'] }), []);

assert.deepEqual(musicLibraryVocalLabels('F'), ['F']);
assert.deepEqual(musicLibraryVocalLabels('M'), ['M']);
assert.deepEqual(musicLibraryVocalLabels('F,M'), ['F', 'M']);
assert.deepEqual(musicLibraryVocalLabels('Female, Male'), ['F', 'M']);
assert.deepEqual(musicLibraryVocalLabels(null), []);

assert.deepEqual(
  parseMusicLibrarySnapshotArtists({
    main_artists: [
      { name: 'The Weeknd', slug: 'the-weeknd' },
      { name: 'Tomoko Aran', slug: 'tomoko-aran' },
    ],
  }),
  [
    { name: 'The Weeknd', slug: 'the-weeknd' },
    { name: 'Tomoko Aran', slug: 'tomoko-aran' },
  ],
);

assert.equal(
  musicLibraryArtistNameFromRow({ name_base: 'Weeknd', the_prefix: 'The', name: 'Weeknd' }),
  'The Weeknd',
);
assert.equal(
  musicLibraryArtistNameFromRow({ name: 'The Police', name_base: 'Police', the_prefix: 'The' }),
  'The Police',
);
assert.equal(
  musicLibraryArtistNameFromRow({ name: 'The Weeknd', the_prefix: 'The' }),
  'The Weeknd',
);
assert.equal(
  musicLibraryArtistNameFromRow({ name: 'Weeknd', the_prefix: 'The' }),
  'The Weeknd',
);
assert.equal(musicLibraryArtistNameFromRow({ name: 'Madonna' }), 'Madonna');
assert.equal(musicLibraryArtistNameFromRow({ name_base: '1975', the_prefix: 'The' }), 'The 1975');

assert.equal(
  resolveMusicLibraryArtistDisplayName({
    name: 'All For Love',
    slug: 'bryan-adams',
    fallbacks: ['Bryan Adams'],
  }),
  'Bryan Adams',
);
assert.equal(
  resolveMusicLibraryArtistDisplayName({
    name: 'Madonna',
    slug: 'madonna',
    fallbacks: [null, undefined, '  '],
  }),
  'Madonna',
);
assert.equal(
  resolveMusicLibraryArtistDisplayName({ name: 'All For Love', slug: 'bryan-adams' }),
  'Bryan Adams',
);
assert.equal(
  resolveMusicLibraryArtistDisplayName({ name: 'Bryan Adams', slug: 'bryan-adams' }),
  'Bryan Adams',
);
assert.equal(
  resolveMusicLibraryArtistDisplayName({ name: 'The Beatles', slug: 'beatles' }),
  'The Beatles',
);

console.log('music-library-labels.unit-test: ok');
