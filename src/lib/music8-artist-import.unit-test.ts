import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildArtistNameMatchVariants,
  buildArtistPatchFromMusic8Json,
  displayNameFromArtistRow,
  lowerNameKeyForArtistUnique,
  normalizeMusic8ArtistSource,
  parseArtistsListJson,
  parseMusic8ThePrefix,
  pickCanonicalArtistRow,
} from '@/lib/music8-artist-import';

function run() {
  const strokesPath = path.resolve(process.cwd(), 'log/strokes.json');
  const raw = JSON.parse(fs.readFileSync(strokesPath, 'utf8'));
  const src = normalizeMusic8ArtistSource(raw);
  assert.ok(src);
  assert.equal(parseMusic8ThePrefix(src!), 'The');

  const patch = buildArtistPatchFromMusic8Json(src!);
  assert.equal(patch.name, 'The Strokes');
  assert.equal(patch.name_base, 'Strokes');
  assert.equal(patch.the_prefix, 'The');
  assert.equal(patch.music8_artist_slug, 'strokes');
  assert.equal(patch.music8_artist_id, 4834);
  assert.equal(patch.name_ja, 'ザ・ストロークス');
  assert.equal(patch.kind, 'band');
  assert.equal(patch.origin_country, 'US');
  assert.equal(patch.active_year_start, '1998');
  assert.equal(patch.active_period, '1998 -');
  assert.equal(patch.name_sort, 'strokes');

  assert.equal(
    displayNameFromArtistRow({ name_base: 'Strokes', the_prefix: 'The', name: 'legacy' }),
    'The Strokes',
  );

  const variants = buildArtistNameMatchVariants({
    name: 'The 1975',
    name_base: '1975',
    the_prefix: 'The',
  });
  assert.ok(variants.includes('The 1975'));
  assert.ok(variants.includes('1975'));
  assert.equal(lowerNameKeyForArtistUnique('AC/DC'), lowerNameKeyForArtistUnique('ac/dc'));

  const canon = pickCanonicalArtistRow(
    [
      { id: 'a', name: '5 Seconds of Summer', music8_artist_slug: null, music8_artist_id: null },
      { id: 'b', name: '5 Seconds of Summer', music8_artist_slug: '5sos', music8_artist_id: 99 },
    ],
    { name: '5 Seconds of Summer', music8_artist_slug: '5sos', music8_artist_id: 99 },
  );
  assert.equal(canon?.id, 'b');

  const canonM8Id = pickCanonicalArtistRow(
    [
      { id: 'slug-only', name: 'Amadou & Mariam', music8_artist_slug: 'amadou-mariam', music8_artist_id: null },
      { id: 'wrong-m8', name: 'NOAPOLOGY', music8_artist_slug: 'noapology', music8_artist_id: 6624 },
    ],
    { name: 'Amadou & Mariam', music8_artist_slug: 'amadou-mariam', music8_artist_id: 6624 },
  );
  assert.equal(canonM8Id?.id, 'slug-only');

  const list = parseArtistsListJson([
    { id: 4834, name: 'Strokes', slug: 'strokes' },
    { id: 1, slug: 'bad_slug', name: 'x' },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].slug, 'strokes');
  assert.equal(list[0].music8ArtistId, 4834);

  const listFile = path.resolve(process.cwd(), 'log/artists.json');
  if (fs.existsSync(listFile)) {
    const fromFile = parseArtistsListJson(JSON.parse(fs.readFileSync(listFile, 'utf8')));
    assert.ok(fromFile.length > 6000, `artists.json entries: ${fromFile.length}`);
  }

  console.log('music8-artist-import.unit-test: ok');
}

run();
