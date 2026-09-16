/**
 * `npx tsx src/lib/music-library-genre-index.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  countMusicLibraryGenresByLetter,
  filterMusicLibraryGenresByLetter,
  filterMusicLibraryGenresBySearchQuery,
  toMusicLibraryGenreIndexEntry,
} from '@/lib/music-library-genre-index';

const britpop = toMusicLibraryGenreIndexEntry({
  slug: 'britpop',
  name: 'Britpop',
  nameJa: 'ブリットポップ',
  count: 12,
});
const synth = toMusicLibraryGenreIndexEntry({
  slug: 'synth-pop',
  name: 'Synth-pop',
  count: 4,
});
const funk = toMusicLibraryGenreIndexEntry({
  slug: 'funk',
  name: 'Funk',
  count: 8,
});
assert.ok(britpop);
assert.ok(synth);
assert.ok(funk);
assert.equal(britpop.href, '/music/genres/britpop/1');
assert.equal(britpop.indexLetter, 'B');
assert.equal(toMusicLibraryGenreIndexEntry({ slug: 'pop', name: 'Pop', count: 0 }), null);
assert.equal(toMusicLibraryGenreIndexEntry({ slug: 'f', name: 'F', count: 3 }), null);

const twoStep = toMusicLibraryGenreIndexEntry({
  slug: '2-step',
  name: '2-step',
  count: 5,
});
assert.ok(twoStep);
assert.equal(twoStep.indexLetter, '2');
assert.equal(twoStep.href, '/music/genres/2-step/1');

const items = [britpop, synth, funk, twoStep];
assert.deepEqual(
  filterMusicLibraryGenresByLetter(items, 'b').map((g) => g.slug),
  ['britpop'],
);
assert.deepEqual(
  filterMusicLibraryGenresByLetter(items, '0-9').map((g) => g.slug),
  ['2-step'],
);
assert.deepEqual(
  filterMusicLibraryGenresByLetter(items, '2').map((g) => g.slug),
  ['2-step'],
);
assert.deepEqual(
  filterMusicLibraryGenresBySearchQuery(items, 'synth').map((g) => g.slug),
  ['synth-pop'],
);
assert.deepEqual(
  filterMusicLibraryGenresBySearchQuery(items, 'ブリット').map((g) => g.slug),
  ['britpop'],
);
assert.equal(filterMusicLibraryGenresBySearchQuery(items, '').length, 0);
assert.equal(countMusicLibraryGenresByLetter(items).get('b'), 1);
assert.equal(countMusicLibraryGenresByLetter(items).get('s'), 1);
assert.equal(countMusicLibraryGenresByLetter(items).get('0-9'), 1);

console.log('music-library-genre-index.unit-test: ok');
