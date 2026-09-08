import assert from 'node:assert/strict';
import {
  adminRegisteredSongsOrder,
  parseAdminRegisteredSongsScope,
  parseAdminRegisteredSongsSort,
} from '@/lib/admin-registered-songs-sort';

assert.equal(parseAdminRegisteredSongsSort(null), 'created_at_desc');
assert.equal(parseAdminRegisteredSongsSort('artist_asc'), 'artist_asc');
assert.equal(parseAdminRegisteredSongsSort('nope'), 'created_at_desc');
assert.equal(parseAdminRegisteredSongsScope('western'), 'western');
assert.equal(parseAdminRegisteredSongsScope(''), 'all');
assert.equal(adminRegisteredSongsOrder('release_desc').column, 'original_release_date');
assert.equal(adminRegisteredSongsOrder('created_at_desc').ascending, false);
console.log('admin-registered-songs-sort.unit-test: ok');
