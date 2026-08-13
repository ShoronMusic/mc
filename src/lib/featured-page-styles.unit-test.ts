/**
 * 特集ページスタイル定数の単体テスト
 * npx tsx src/lib/featured-page-styles.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  FEATURED_PAGE_STYLE_OPTIONS,
  groupFeaturedArtistsByStyle,
  parseFeaturedPageStyle,
} from './featured-page-styles';

assert.equal(FEATURED_PAGE_STYLE_OPTIONS.length, 9);
assert.equal(parseFeaturedPageStyle('Pop'), 'Pop');
assert.equal(parseFeaturedPageStyle('Others'), 'Other');
assert.equal(parseFeaturedPageStyle('Hip Hop'), 'Hip-hop');
assert.equal(parseFeaturedPageStyle('Alternative rock'), 'Alternative');
assert.equal(parseFeaturedPageStyle('nope'), null);

const grouped = groupFeaturedArtistsByStyle([
  { style: 'Dance', artist: 'A', sort_order: 2 },
  { style: 'Dance', artist: 'B', sort_order: 1 },
  { style: 'Metal', artist: 'C', sort_order: 0 },
  { style: 'Pop', artist: 'D', sort_order: 0 },
]);
assert.deepEqual(
  grouped.map((g) => g.style),
  ['Pop', 'Dance', 'Metal'],
);
assert.deepEqual(
  grouped.find((g) => g.style === 'Dance')?.artists.map((a) => a.artist),
  ['B', 'A'],
);

console.log('featured-page-styles.unit-test: ok');
