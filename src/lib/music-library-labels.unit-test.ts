/**
 * `npx tsx src/lib/music-library-labels.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  formatMusicLibraryOriginLabel,
  formatMusicLibraryYearMonth,
  musicLibraryVocalLabels,
  parseMusicLibraryGenresColumn,
  parseMusicLibrarySnapshotArtists,
  pickMusicLibraryGenreLabel,
} from '@/lib/music-library-labels';

assert.equal(formatMusicLibraryYearMonth('2026-09-14'), '2026.09');
assert.equal(formatMusicLibraryYearMonth('1983-05-20'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('1983.05'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('1983/5'), '1983.05');
assert.equal(formatMusicLibraryYearMonth('2026'), '2026');
assert.equal(formatMusicLibraryYearMonth(null), null);
assert.equal(formatMusicLibraryYearMonth(''), null);
assert.equal(formatMusicLibraryYearMonth('tba'), null);

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

console.log('music-library-labels.unit-test: ok');
