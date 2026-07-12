import assert from 'node:assert/strict';
import {
  artistIdentityKey,
  classifyArtistMergePair,
  findHighConfidenceMergePairs,
  pickKeepAndLose,
  type ArtistMergeRow,
} from '@/lib/admin-artist-merge';

assert.equal(artistIdentityKey('米津玄師'), artistIdentityKey('米津 玄師'));
assert.equal(artistIdentityKey('菅田将暉'), artistIdentityKey('菅田　将暉'));
assert.notEqual(artistIdentityKey('米津玄師'), artistIdentityKey('宇多田ヒカル'));

const yonezuJa: ArtistMergeRow = {
  id: '1',
  name: '米津玄師',
  name_en: 'Kenshi Yonezu',
  music8_artist_id: 10,
  created_at: '2026-01-01T00:00:00Z',
};
const yonezuSpace: ArtistMergeRow = {
  id: '2',
  name: '米津 玄師',
  created_at: '2026-07-12T00:00:00Z',
};
const yonezuEn: ArtistMergeRow = {
  id: '3',
  name: 'Kenshi Yonezu',
  created_at: '2026-07-12T01:00:00Z',
};

const c1 = classifyArtistMergePair(yonezuJa, yonezuSpace);
assert.equal(c1?.confidence, 'high');

const c2 = classifyArtistMergePair(yonezuJa, yonezuEn);
assert.equal(c2?.confidence, 'high');

const keep = pickKeepAndLose(yonezuJa, yonezuEn, new Map());
assert.equal(keep.keep.id, '1');
assert.equal(keep.lose.id, '3');

const sudaJa: ArtistMergeRow = {
  id: 'a',
  name: '菅田将暉',
  name_en: 'SUDA MASAKI',
  music8_artist_slug: 'jp-h3xhn2',
  created_at: '2026-07-12T04:00:00Z',
};
const sudaEn: ArtistMergeRow = {
  id: 'b',
  name: 'SUDA MASAKI',
  created_at: '2026-07-12T03:00:00Z',
};
const c3 = classifyArtistMergePair(sudaJa, sudaEn);
assert.equal(c3?.confidence, 'high');

const conflictA: ArtistMergeRow = { id: 'x', name: 'Foo', music8_artist_id: 1 };
const conflictB: ArtistMergeRow = { id: 'y', name: 'Foo', music8_artist_id: 2 };
assert.equal(classifyArtistMergePair(conflictA, conflictB)?.confidence, 'blocked');

const pairs = findHighConfidenceMergePairs([yonezuJa, yonezuSpace, yonezuEn, sudaJa, sudaEn]);
assert.ok(pairs.length >= 2, `expected >=2 pairs, got ${pairs.length}`);

console.log('admin-artist-merge.unit-test.ts: ok');
