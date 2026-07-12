/**
 * npx tsx src/lib/spotify-artist-match-hints.unit-test.ts
 */
import assert from 'node:assert/strict';
import {
  artistNameVariantsFromMusic8Slug,
  isGeneratedJpArtistSlug,
  spotifySearchHintFromMusic8Slug,
} from '@/lib/spotify-artist-match-hints';
import { pickBestSpotifyCandidate, scoreSpotifyTrackCandidate } from '@/lib/spotify-track-match';

assert.equal(isGeneratedJpArtistSlug('jp-h3xhn2'), true);
assert.equal(isGeneratedJpArtistSlug('sakanaction'), false);
assert.equal(spotifySearchHintFromMusic8Slug('jp-h3xhn2'), null);
assert.equal(spotifySearchHintFromMusic8Slug('sakanaction'), 'sakanaction');
assert.equal(spotifySearchHintFromMusic8Slug('one-ok-rock'), 'one ok rock');
assert.deepEqual(artistNameVariantsFromMusic8Slug('one-ok-rock').sort(), [
  'one ok rock',
  'oneokrock',
].sort());

const kaiju = {
  spotifyTrackId: '6FhWelfRDMfZRtFUU6SldC',
  spotifyName: '怪獣',
  spotifyArtists: 'Sakanaction',
  artistRefs: [{ id: 'sak', name: 'Sakanaction' }],
  popularity: 70,
};

// name_en なしでも slug エイリアスで apply
const dSlug = scoreSpotifyTrackCandidate(kaiju, 'サカナクション', '怪獣', {
  alternateArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
  crossScriptArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
});
assert.equal(dSlug.action, 'apply');

const picked = pickBestSpotifyCandidate([kaiju], 'サカナクション', '怪獣', {
  alternateArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
  crossScriptArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
});
assert.equal(picked.decision.action, 'apply');
assert.equal(picked.best?.spotifyTrackId, '6FhWelfRDMfZRtFUU6SldC');

const kaijuEn = {
  spotifyTrackId: '7sMR',
  spotifyName: 'Kaiju',
  spotifyArtists: 'sakanaction',
  artistRefs: [{ id: 'sak', name: 'sakanaction' }],
  popularity: 70,
};
assert.equal(
  scoreSpotifyTrackCandidate(kaijuEn, 'サカナクション', '怪獣', {
    alternateArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
    crossScriptArtistNames: artistNameVariantsFromMusic8Slug('sakanaction'),
  }).action,
  'apply',
);

console.log('spotify-artist-match-hints.unit-test: ok');
