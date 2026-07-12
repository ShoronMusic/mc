/**
 * npx tsx src/lib/admin-domestic-spotify-enrich.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  clampDomesticSpotifyEnrichLimit,
  filterDomesticSpotifyEnrichTargets,
  isDomesticSpotifyEnrichTarget,
  songNeedsSpotifyFields,
  type DomesticSpotifySongRow,
} from '@/lib/admin-domestic-spotify-enrich';
import {
  resetWesternTreatedJpArtistCacheForTests,
  setWesternTreatedJpArtistKeysForTests,
} from '@/lib/western-treated-jp-artists';

resetWesternTreatedJpArtistCacheForTests();
setWesternTreatedJpArtistKeysForTests(new Set(['fujiikaze', 'oneokrock']));

assert.equal(songNeedsSpotifyFields({ spotify_track_id: null, spotify_popularity: null }), true);
assert.equal(songNeedsSpotifyFields({ spotify_track_id: 'abc', spotify_popularity: null }), true);
assert.equal(songNeedsSpotifyFields({ spotify_track_id: null, spotify_popularity: 40 }), true);
assert.equal(songNeedsSpotifyFields({ spotify_track_id: 'abc', spotify_popularity: 40 }), false);

assert.equal(clampDomesticSpotifyEnrichLimit(undefined), 30);
assert.equal(clampDomesticSpotifyEnrichLimit(100), 50);
assert.equal(clampDomesticSpotifyEnrichLimit(0), 1);
assert.equal(clampDomesticSpotifyEnrichLimit(12), 12);

const domesticMissing: DomesticSpotifySongRow = {
  id: '1',
  display_title: '米津玄師 - Lemon',
  main_artist: '米津玄師',
  song_title: 'Lemon',
  catalog_scope: 'domestic',
  spotify_track_id: null,
  spotify_popularity: null,
};

const domesticComplete: DomesticSpotifySongRow = {
  ...domesticMissing,
  id: '2',
  spotify_track_id: 'sp1',
  spotify_popularity: 55,
};

const westernScope: DomesticSpotifySongRow = {
  id: '3',
  display_title: 'The Beatles - Hey Jude',
  main_artist: 'The Beatles',
  song_title: 'Hey Jude',
  catalog_scope: 'western',
  spotify_track_id: null,
  spotify_popularity: null,
};

const westernTreated: DomesticSpotifySongRow = {
  id: '4',
  display_title: 'Fujii Kaze - 死ぬのがいいわ',
  main_artist: 'Fujii Kaze',
  song_title: '死ぬのがいいわ',
  catalog_scope: 'domestic',
  spotify_track_id: null,
  spotify_popularity: null,
};

const westernTreatedBySlug: DomesticSpotifySongRow = {
  id: '5',
  display_title: 'ONE OK ROCK - Renegades',
  main_artist: 'Someone Else',
  song_title: 'Renegades',
  catalog_scope: 'domestic',
  music8_artist_slug: 'one-ok-rock',
  spotify_track_id: null,
  spotify_popularity: null,
};

const unknownScope: DomesticSpotifySongRow = {
  id: '6',
  display_title: 'Unknown - Track',
  main_artist: 'Unknown',
  song_title: 'Track',
  catalog_scope: 'unknown',
  spotify_track_id: null,
  spotify_popularity: null,
};

const idOnlyMissingPop: DomesticSpotifySongRow = {
  id: '7',
  display_title: '米津玄師 - LOSER',
  main_artist: '米津玄師',
  song_title: 'LOSER',
  catalog_scope: 'domestic',
  spotify_track_id: 'existing',
  spotify_popularity: null,
};

assert.equal(isDomesticSpotifyEnrichTarget(domesticMissing), true);
assert.equal(isDomesticSpotifyEnrichTarget(domesticComplete), false);
assert.equal(isDomesticSpotifyEnrichTarget(westernScope), false);
assert.equal(isDomesticSpotifyEnrichTarget(westernTreated), false);
assert.equal(isDomesticSpotifyEnrichTarget(westernTreatedBySlug), false);
assert.equal(isDomesticSpotifyEnrichTarget(unknownScope), false);
assert.equal(isDomesticSpotifyEnrichTarget(idOnlyMissingPop), true);

const filtered = filterDomesticSpotifyEnrichTargets([
  domesticMissing,
  domesticComplete,
  westernScope,
  westernTreated,
  westernTreatedBySlug,
  unknownScope,
  idOnlyMissingPop,
]);
assert.deepEqual(
  filtered.map((r) => r.id).sort(),
  ['1', '7'],
);

resetWesternTreatedJpArtistCacheForTests();
console.log('admin-domestic-spotify-enrich.unit-test: ok');
