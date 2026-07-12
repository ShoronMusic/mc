import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifySongTitleForMusicBrainzLookup } from '@/lib/admin-song-musicbrainz-lookup';

test('simplifySongTitleForMusicBrainzLookup strips parentheses', () => {
  assert.equal(
    simplifySongTitleForMusicBrainzLookup('JANE DOE (ChainsawMan–TheMovie:RezeArc)'),
    'JANE DOE',
  );
  assert.equal(simplifySongTitleForMusicBrainzLookup('IRIS OUT'), null);
});
