/**
 * npx tsx src/lib/artist-occupation-options.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  canonicalizeArtistOccupations,
  findArtistOccupationOption,
  isArtistOccupationSelected,
  toggleArtistOccupation,
  extraArtistOccupations,
} from '@/lib/artist-occupation-options';

assert.equal(findArtistOccupationOption('singer')?.label, 'Singer');
assert.equal(findArtistOccupationOption('Guitaristr')?.value, 'guitarist');
assert.deepEqual(canonicalizeArtistOccupations(['singer', 'Musician', 'singer']), [
  'Singer',
  'Musician',
]);

let sel = ['Singer'];
sel = toggleArtistOccupation(sel, { value: 'musician', label: 'Musician' });
assert.deepEqual(sel, ['Singer', 'Musician']);
assert.equal(isArtistOccupationSelected(sel, { value: 'singer', label: 'Singer' }), true);
sel = toggleArtistOccupation(sel, { value: 'singer', label: 'Singer' });
assert.deepEqual(sel, ['Musician']);
assert.deepEqual(extraArtistOccupations(['Musician', 'Custom Role']), ['Custom Role']);

console.log('artist-occupation-options.unit-test: ok');
