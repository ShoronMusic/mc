import assert from 'node:assert/strict';
import {
  appendOriginalReleaseYearSuffix,
  yearFromOriginalReleaseDate,
} from '@/lib/announce-original-release-year';

assert.equal(yearFromOriginalReleaseDate('2026-03-01'), 2026);
assert.equal(yearFromOriginalReleaseDate('1979'), 1979);
assert.equal(yearFromOriginalReleaseDate('1979-07'), 1979);
assert.equal(yearFromOriginalReleaseDate(null), null);
assert.equal(yearFromOriginalReleaseDate(''), null);
assert.equal(yearFromOriginalReleaseDate('nope'), null);

assert.equal(
  appendOriginalReleaseYearSuffix("Chaka Khan - Boogie's In My Soul", 2026),
  "Chaka Khan - Boogie's In My Soul (2026)",
);
assert.equal(
  appendOriginalReleaseYearSuffix('Artist - Song（邦楽）', 1999),
  'Artist - Song（邦楽） (1999)',
);
assert.equal(
  appendOriginalReleaseYearSuffix('Artist - Song (1979)', 2020),
  'Artist - Song (1979)',
);
assert.equal(appendOriginalReleaseYearSuffix('Artist - Song', null), 'Artist - Song');
assert.equal(appendOriginalReleaseYearSuffix('Artist - Song', 1800), 'Artist - Song');

console.log('announce-original-release-year.unit-test: ok');
