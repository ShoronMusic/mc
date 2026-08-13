/**
 * 特集ページ slug / 名前正規化
 * npx tsx src/lib/featured-pages.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  formatFeaturedArtistDisplayLabel,
  normalizeArtistNameKey,
  normalizeFeaturedLabelNote,
  slugifyFeaturedPageTitle,
} from './featured-pages';

assert.equal(slugifyFeaturedPageTitle('Summer Sonic 2026'), 'summer-sonic-2026');
assert.equal(normalizeArtistNameKey('  THE   Strokes '), 'the strokes');
assert.equal(
  formatFeaturedArtistDisplayLabel('DAVID BYRNE', 'Talking Heads'),
  'DAVID BYRNE (Talking Heads)',
);
assert.equal(formatFeaturedArtistDisplayLabel('DAVID BYRNE', '  '), 'DAVID BYRNE');
assert.equal(normalizeFeaturedLabelNote('  Talking Heads  '), 'Talking Heads');
assert.equal(normalizeFeaturedLabelNote(''), null);

console.log('featured-pages.unit-test: ok');
