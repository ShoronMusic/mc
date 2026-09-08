/**
 * `npx tsx src/lib/music8-genre-style-map.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  mapGenreTextsToSongStyle,
  mapMusic8NavSlugToAppSongStyle,
  mapMusic8StyleIdsToSongStyle,
} from '@/lib/music8-genre-style-map';

assert.equal(mapGenreTextsToSongStyle(['contemporary r&b']), 'R&B');
assert.equal(mapGenreTextsToSongStyle(['neo-soul', 'soul']), 'R&B');
assert.equal(mapGenreTextsToSongStyle(['hip hop soul']), 'R&B');
assert.equal(mapGenreTextsToSongStyle(['quiet storm']), 'R&B');
assert.equal(mapGenreTextsToSongStyle(['rhythm and blues']), 'R&B');
assert.equal(mapGenreTextsToSongStyle(['adult contemporary']), 'Pop');
assert.equal(mapGenreTextsToSongStyle(['soft rock']), 'Pop');
assert.equal(mapGenreTextsToSongStyle(['alternative rock']), 'Alternative rock');
assert.equal(mapGenreTextsToSongStyle(['unknown-genre-xyz']), null);
assert.equal(mapMusic8StyleIdsToSongStyle([2847]), 'R&B');
assert.equal(mapMusic8StyleIdsToSongStyle([99999]), null);
assert.equal(mapMusic8NavSlugToAppSongStyle('pop'), 'Pop');
assert.equal(mapMusic8NavSlugToAppSongStyle('alternative'), 'Alternative rock');
assert.equal(mapMusic8NavSlugToAppSongStyle('rb'), 'R&B');
assert.equal(mapMusic8NavSlugToAppSongStyle('others'), 'Other');
assert.equal(mapMusic8NavSlugToAppSongStyle(''), null);

console.log('music8-genre-style-map.unit-test: ok');
