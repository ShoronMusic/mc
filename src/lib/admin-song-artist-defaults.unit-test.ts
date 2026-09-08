/**
 * `npx tsx src/lib/admin-song-artist-defaults.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  countGenreFrequencies,
  genreAlphabetInitial,
  groupGenresByInitial,
  isSingleMainArtistName,
  pickMajorityVocal,
  mergeSongVocalHint,
  normalizeCatalogGenreName,
  uniqueNormalizedGenreNames,
} from '@/lib/admin-song-artist-defaults';

assert.equal(isSingleMainArtistName('AURORA', 0), true);
assert.equal(isSingleMainArtistName('AURORA', 1), true);
assert.equal(isSingleMainArtistName('AURORA', 2), false);
assert.equal(isSingleMainArtistName('Artist feat. Other', 1), false);
assert.equal(isSingleMainArtistName('Artist & Other', 1), false);
assert.equal(isSingleMainArtistName('Tyler, The Creator', 1), true);
assert.equal(isSingleMainArtistName('AURORA, Wardruna', 1), false);

assert.equal(pickMajorityVocal(['F', 'F', 'Female', 'M']), 'F');
assert.equal(pickMajorityVocal(['M', 'male']), 'M');
assert.equal(pickMajorityVocal(['F', 'M']), null);
assert.equal(pickMajorityVocal([null, 'lead']), null);
assert.equal(mergeSongVocalHint(null, 'F'), 'F');
assert.equal(mergeSongVocalHint('M', 'F'), 'M');
assert.equal(mergeSongVocalHint('', 'Female'), 'F');
assert.equal(pickMajorityVocal([mergeSongVocalHint(null, 'F'), mergeSongVocalHint(null, 'F'), null]), 'F');

const freq = countGenreFrequencies([
  ['Art pop', 'Electropop'],
  ['Art pop', 'art pop'],
  ['Indie pop'],
]);
assert.equal(freq[0].name, 'Art pop');
assert.equal(freq[0].count, 2);
assert.equal(freq.length, 3);

const encoded = countGenreFrequencies([
  ['R&amp;B', 'Dance-pop'],
  ['R&B', 'Hip-Hop/Rap'],
  ['R&amp;amp;B'],
]);
assert.equal(encoded.find((g) => g.name === 'R&B')?.count, 3);
assert.equal(encoded.some((g) => g.name.includes('&amp;')), false);

assert.equal(normalizeCatalogGenreName('R&amp;B'), 'R&B');
assert.deepEqual(uniqueNormalizedGenreNames(['R&amp;B', 'R&B', ' Dance-pop ']), ['R&B', 'Dance-pop']);

assert.equal(genreAlphabetInitial('Art pop'), 'A');
assert.equal(genreAlphabetInitial('synth-pop'), 'S');
assert.equal(genreAlphabetInitial('80s'), '#');

const grouped = groupGenresByInitial(['Zoo', 'Art pop', '80s', 'Alternative']);
assert.equal(grouped[0].initial, 'A');
assert.equal(grouped[grouped.length - 1].initial, '#');

console.log('admin-song-artist-defaults.unit-test: ok');
