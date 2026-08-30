/**
 * 特集ページ slug / 名前正規化
 * npx tsx src/lib/featured-pages.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  extractFeaturedPageYear,
  formatFeaturedArtistDisplayLabel,
  groupFeaturedPagesByYear,
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

assert.equal(extractFeaturedPageYear('Summer Sonic 2026'), 2026);
assert.equal(extractFeaturedPageYear('フジロック', 'fuji-rock-2025'), 2025);
assert.equal(extractFeaturedPageYear('特集タイトル'), null);

const grouped = groupFeaturedPagesByYear([
  { title: 'Summer Sonic 2026', slug: 'summer-sonic-2026' },
  { title: 'フジロック', slug: 'fuji-rock-2025' },
  { title: '年なし特集', slug: 'misc' },
]);
assert.equal(grouped.length, 3);
assert.equal(grouped[0]!.label, '2026年');
assert.equal(grouped[0]!.pages[0]!.title, 'Summer Sonic 2026');
assert.equal(grouped[1]!.label, '2025年');
assert.equal(grouped[2]!.label, 'その他');

console.log('featured-pages.unit-test: ok');
