import {
  domesticJpArtistMatchCandidates,
  looksLikeOfficialArtistChannel,
  matchesDomesticJpArtist,
  normalizeDomesticJpArtistKey,
  resetDomesticJpArtistCacheForTests,
  setDomesticJpArtistKeysForTests,
  stripYoutubeOfficialChannelSuffix,
  validateDomesticJpArtistNameInput,
} from './domestic-jp-artists';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

resetDomesticJpArtistCacheForTests();
assert(normalizeDomesticJpArtistKey('Mr.Children') === 'mrchildren', 'normalize mrchildren');
assert(
  stripYoutubeOfficialChannelSuffix('Mr.Children Official Channel') === 'Mr.Children',
  'strip official channel',
);
assert(looksLikeOfficialArtistChannel('Ado Official Channel'), 'official channel suffix');

assert(matchesDomesticJpArtist('Mr.Children'), 'legacy mrchildren without cache');
assert(
  matchesDomesticJpArtist('Mr.children Official Channel'),
  'legacy mrchildren via channel',
);
assert(!matchesDomesticJpArtist('The Beatles'), 'not listed legacy');

setDomesticJpArtistKeysForTests(['mrchildren', 'mrsgreenapple']);
assert(matchesDomesticJpArtist('Mr.Children'), 'db mrchildren');
assert(matchesDomesticJpArtist('Mrs. GREEN APPLE'), 'db mrs green apple');
assert(!matchesDomesticJpArtist('Billie Eilish'), 'not listed');

assert(
  domesticJpArtistMatchCandidates('Mr.Children Official Channel').includes('Mr.Children'),
  'candidates include stripped channel',
);

assert(validateDomesticJpArtistNameInput('Mr.Children') === 'Mr.Children', 'valid name');
assert(validateDomesticJpArtistNameInput('') === null, 'empty name');

console.log('domestic-jp-artists.unit-test.ts: ok');
