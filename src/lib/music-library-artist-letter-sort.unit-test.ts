/**
 * `npx tsx src/lib/music-library-artist-letter-sort.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  parseMusicLibraryArtistLetterDir,
  parseMusicLibraryArtistLetterSort,
  sortMusicLibraryArtistLetterItems,
} from '@/lib/music-library-artist-letter-sort';

assert.equal(parseMusicLibraryArtistLetterSort('songs'), 'songs');
assert.equal(parseMusicLibraryArtistLetterSort('abc'), 'abc');
assert.equal(parseMusicLibraryArtistLetterSort('nope'), 'abc');
assert.equal(parseMusicLibraryArtistLetterDir(null, 'abc'), 'asc');
assert.equal(parseMusicLibraryArtistLetterDir(null, 'songs'), 'desc');
assert.equal(parseMusicLibraryArtistLetterDir('asc', 'songs'), 'asc');

assert.equal(parseMusicLibraryArtistLetterSort('active'), 'active');
assert.equal(parseMusicLibraryArtistLetterDir(null, 'active'), 'desc');

const rows = [
  { name: 'a-ha', count: 13, activeStartYear: 1982 },
  { name: 'The Animals', count: 4, activeStartYear: 1963 },
  { name: 'Aaliyah', count: 1, activeStartYear: 1994 },
  { name: 'A$AP Rocky', count: 10, activeStartYear: 2011 },
];

const abcAsc = sortMusicLibraryArtistLetterItems(rows, 'abc', 'asc').map((r) => r.name);
assert.deepEqual(abcAsc, ['a-ha', 'A$AP Rocky', 'Aaliyah', 'The Animals']);

const abcDesc = sortMusicLibraryArtistLetterItems(rows, 'abc', 'desc').map((r) => r.name);
assert.deepEqual(abcDesc, ['The Animals', 'Aaliyah', 'A$AP Rocky', 'a-ha']);

const songsDesc = sortMusicLibraryArtistLetterItems(rows, 'songs', 'desc').map((r) => r.name);
assert.deepEqual(songsDesc, ['a-ha', 'A$AP Rocky', 'The Animals', 'Aaliyah']);

const songsAsc = sortMusicLibraryArtistLetterItems(rows, 'songs', 'asc').map((r) => r.name);
assert.deepEqual(songsAsc, ['Aaliyah', 'The Animals', 'A$AP Rocky', 'a-ha']);

const activeDesc = sortMusicLibraryArtistLetterItems(rows, 'active', 'desc').map((r) => r.name);
assert.deepEqual(activeDesc, ['A$AP Rocky', 'Aaliyah', 'a-ha', 'The Animals']);

const activeAsc = sortMusicLibraryArtistLetterItems(rows, 'active', 'asc').map((r) => r.name);
assert.deepEqual(activeAsc, ['The Animals', 'a-ha', 'Aaliyah', 'A$AP Rocky']);

const missingYearLast = sortMusicLibraryArtistLetterItems(
  [...rows, { name: 'Unknown Act', count: 2, activeStartYear: null }],
  'active',
  'desc',
).map((r) => r.name);
assert.equal(missingYearLast[missingYearLast.length - 1], 'Unknown Act');

console.log('music-library-artist-letter-sort.unit-test: ok');
