import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simplifySongTitleForMusicBrainzLookup,
  songTitleLooksNonStudioVariant,
} from '@/lib/admin-song-musicbrainz-lookup';

test('simplifySongTitleForMusicBrainzLookup strips parentheses', () => {
  assert.equal(
    simplifySongTitleForMusicBrainzLookup('JANE DOE (ChainsawMan–TheMovie:RezeArc)'),
    'JANE DOE',
  );
  assert.equal(simplifySongTitleForMusicBrainzLookup('IRIS OUT'), null);
});

test('simplifySongTitleForMusicBrainzLookup strips live and official video markers', () => {
  assert.equal(
    simplifySongTitleForMusicBrainzLookup('Tears In Heaven (Live)'),
    'Tears In Heaven',
  );
  assert.equal(
    simplifySongTitleForMusicBrainzLookup('Everybody Hurts Official Music Video'),
    'Everybody Hurts',
  );
  assert.equal(songTitleLooksNonStudioVariant('Tears In Heaven (Live at Royal Albert Hall)'), true);
  assert.equal(songTitleLooksNonStudioVariant('Tears In Heaven'), false);
});
