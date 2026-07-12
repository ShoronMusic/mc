import {
  librarySongRowMatchesWesternTreatedJpArtist,
  matchesWesternTreatedJpArtist,
  normalizeWesternTreatedJpArtistKey,
  resetWesternTreatedJpArtistCacheForTests,
  setWesternTreatedJpArtistKeysForTests,
  validateWesternTreatedJpArtistNameInput,
} from './western-treated-jp-artists';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

resetWesternTreatedJpArtistCacheForTests();
assert(normalizeWesternTreatedJpArtistKey('ONE OK ROCK') === 'oneokrock', 'normalize oOR');
assert(normalizeWesternTreatedJpArtistKey('  Ado  ') === 'ado', 'normalize ado');

assert(matchesWesternTreatedJpArtist('ONE OK ROCK'), 'legacy one ok rock without cache');
assert(matchesWesternTreatedJpArtist('ワンオクロック'), 'legacy ワンオクロック');

setWesternTreatedJpArtistKeysForTests(['ado', 'oneokrock']);
assert(matchesWesternTreatedJpArtist('Ado'), 'db ado');
assert(matchesWesternTreatedJpArtist('ONE OK ROCK'), 'db oOR');
assert(!matchesWesternTreatedJpArtist('米津玄師'), 'not listed');

assert(validateWesternTreatedJpArtistNameInput('Ado') === 'Ado', 'valid name');
assert(validateWesternTreatedJpArtistNameInput('') === null, 'empty name');

setWesternTreatedJpArtistKeysForTests(['fujiikaze']);
assert(
  librarySongRowMatchesWesternTreatedJpArtist({
    main_artist: '藤井 風',
    music8_artist_slug: 'fujiikaze',
  }),
  'library match by slug for jp main_artist',
);
assert(
  librarySongRowMatchesWesternTreatedJpArtist({
    main_artist: 'Fujii Kaze',
    song_title: 'Michiteyuku',
  }),
  'library match by western-treated name',
);
assert(
  !librarySongRowMatchesWesternTreatedJpArtist({
    main_artist: '米津玄師',
    song_title: 'Lemon',
  }),
  'non-listed artist',
);

console.log('western-treated-jp-artists.unit-test.ts: ok');
