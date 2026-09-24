/**
 * `npx tsx src/lib/catalog-genres.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  isBlockedCatalogGenreSlug,
  isCatalogGenreId,
  isCatalogGenreTableMissingError,
  mapCatalogGenreRow,
  normalizeCatalogGenreSlug,
  parseCatalogGenreWriteBody,
  parseCatalogGenreWpTermId,
  resolveCatalogGenreSlug,
} from '@/lib/catalog-genres';

assert.equal(isCatalogGenreId('cd689902-7bf7-4bde-8a2e-1e1c9835027a'), true);
assert.equal(isCatalogGenreId('new'), false);
assert.equal(isCatalogGenreId(''), false);

assert.equal(normalizeCatalogGenreSlug('New Wave'), 'new-wave');
assert.equal(normalizeCatalogGenreSlug('R&B'), 'rb');
assert.equal(resolveCatalogGenreSlug('', 'Synth-pop'), 'synth-pop');
assert.equal(resolveCatalogGenreSlug('  Art Pop  ', 'ignored'), 'art-pop');
assert.equal(resolveCatalogGenreSlug('', 'ブリットポップ'), null);

assert.equal(isBlockedCatalogGenreSlug('a'), true);
assert.equal(isBlockedCatalogGenreSlug('other'), true);
assert.equal(isBlockedCatalogGenreSlug('0-9'), true);
assert.equal(isBlockedCatalogGenreSlug('art-pop'), false);
assert.equal(isBlockedCatalogGenreSlug('pop'), false);

assert.equal(parseCatalogGenreWpTermId(''), null);
assert.equal(parseCatalogGenreWpTermId('12'), 12);
assert.equal(parseCatalogGenreWpTermId(0), undefined);
assert.equal(parseCatalogGenreWpTermId('x'), undefined);

const created = parseCatalogGenreWriteBody({ name: 'Art pop', name_ja: 'アートポップ' });
assert.equal(created.ok, true);
if (created.ok) {
  assert.equal(created.value.slug, 'art-pop');
  assert.equal(created.value.name, 'Art pop');
  assert.equal(created.value.name_ja, 'アートポップ');
  assert.equal(created.value.wp_term_id, null);
}

const encoded = parseCatalogGenreWriteBody({ name: 'R&amp;B' });
assert.equal(encoded.ok, true);
if (encoded.ok) {
  assert.equal(encoded.value.name, 'R&B');
  assert.equal(encoded.value.slug, 'rb');
}

const blocked = parseCatalogGenreWriteBody({ name: 'A', slug: 'a' });
assert.equal(blocked.ok, false);

const missingName = parseCatalogGenreWriteBody({ slug: 'x' });
assert.equal(missingName.ok, false);

const jaOnly = parseCatalogGenreWriteBody({ name: 'シティポップ', slug: 'city-pop' });
assert.equal(jaOnly.ok, true);
if (jaOnly.ok) assert.equal(jaOnly.value.slug, 'city-pop');

const mapped = mapCatalogGenreRow(
  {
    id: 'cd689902-7bf7-4bde-8a2e-1e1c9835027a',
    slug: 'britpop',
    name: 'Britpop',
    name_ja: 'ブリットポップ',
    song_genres: [{ count: 12 }],
  },
  null,
);
assert.ok(mapped);
assert.equal(mapped?.song_count, 12);
assert.equal(mapped?.name_ja, 'ブリットポップ');

assert.equal(
  isCatalogGenreTableMissingError('relation "public.catalog_genres" does not exist'),
  true,
);
assert.equal(isCatalogGenreTableMissingError('permission denied'), false);

console.log('catalog-genres.unit-test: ok');
