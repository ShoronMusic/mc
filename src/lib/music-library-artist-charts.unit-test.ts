/**
 * `npx tsx src/lib/music-library-artist-charts.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  buildMusicLibraryArtistCharts,
  MUSIC_LIBRARY_TOP_GENRES_LIMIT,
  pickDominantNavStyleSlug,
  roundPercentsTo100,
} from '@/lib/music-library-artist-charts';

assert.deepEqual(roundPercentsTo100([1, 1], 2), [50, 50]);
assert.equal(
  roundPercentsTo100([1, 1, 1], 3).reduce((a, b) => a + b, 0),
  100,
);

const mixed = buildMusicLibraryArtistCharts([
  { style: 'Alternative', genres: ['Britpop', 'Chamber pop'] },
  { style: 'Alternative', genres: ['Britpop'] },
  { style: 'Rock', genres: ['Acoustic rock'] },
]);
assert.equal(mixed.songCount, 3);
assert.equal(mixed.styles[0]?.label, 'Alternative');
assert.equal(mixed.styles[0]?.percent, 67);
assert.equal(mixed.styles[1]?.label, 'Rock');
assert.equal(mixed.styles[1]?.percent, 33);
assert.equal(
  mixed.styles.reduce((a, s) => a + s.percent, 0),
  100,
);
assert.equal(mixed.genres[0]?.label, 'Britpop');
assert.equal(mixed.genres[0]?.percent, 67);
assert.equal(mixed.genres.find((g) => g.label === 'Chamber pop')?.percent, 33);
assert.ok(mixed.styles[0]?.href?.includes('/music/styles/alternative'));
assert.equal(mixed.genres[0]?.href, null);

assert.equal(pickDominantNavStyleSlug([['pop', 10], ['rock', 3]]), 'pop');
assert.equal(pickDominantNavStyleSlug([['rock', 2], ['pop', 2]]), 'pop');
assert.equal(pickDominantNavStyleSlug([['metal', 0]]), null);

const overlapHeavy = buildMusicLibraryArtistCharts(
  Array.from({ length: 10 }, (_, i) => ({
    style: 'Alternative',
    genres: i < 9 ? ['Britpop', i % 2 === 0 ? 'Neo-psychedelia' : 'Chamber pop'] : ['Acoustic rock'],
  })),
);
assert.equal(overlapHeavy.styles[0]?.percent, 100);
assert.equal(overlapHeavy.genres.find((g) => g.label === 'Britpop')?.percent, 90);
assert.ok(overlapHeavy.genres.reduce((a, g) => a + g.percent, 0) > 100);
assert.ok(overlapHeavy.genres.length <= MUSIC_LIBRARY_TOP_GENRES_LIMIT);

assert.deepEqual(buildMusicLibraryArtistCharts([]).styles, []);
assert.equal(buildMusicLibraryArtistCharts([{ style: null, genres: null }]).genres.length, 0);

console.log('music-library-artist-charts.unit-test: ok');
