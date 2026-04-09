import assert from 'node:assert/strict';
import {
  normalizeFavoriteArtistsInput,
  normalizeUserPublicProfileBody,
  USER_PUBLIC_PROFILE_ARTIST_EACH_MAX,
} from './user-public-profile';

assert.deepEqual(normalizeFavoriteArtistsInput([]), []);
assert.deepEqual(normalizeFavoriteArtistsInput(['  a ', 'b']), ['a', 'b']);
assert.deepEqual(
  normalizeFavoriteArtistsInput(['1', '2', '3', '4', '5', '6']),
  ['1', '2', '3', '4', '5'],
);
const long = 'x'.repeat(USER_PUBLIC_PROFILE_ARTIST_EACH_MAX + 10);
assert.equal(
  normalizeFavoriteArtistsInput([long])[0]?.length,
  USER_PUBLIC_PROFILE_ARTIST_EACH_MAX,
);

const ok = normalizeUserPublicProfileBody({
  visibleInRooms: true,
  tagline: 'hello',
  favoriteArtists: ['A'],
  listeningNote: 'note',
});
assert.equal(ok.ok, true);
if (ok.ok) {
  assert.equal(ok.value.visibleInRooms, true);
  assert.equal(ok.value.tagline, 'hello');
  assert.deepEqual(ok.value.favoriteArtists, ['A']);
}

const bad = normalizeUserPublicProfileBody({ tagline: 'x'.repeat(300) });
assert.equal(bad.ok, false);

console.log('user-public-profile unit tests: OK');
