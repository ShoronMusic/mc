/**
 * `npx tsx src/lib/admin-new-song-existing-match.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  buildExistingSongIlikePatterns,
  escapeIlikePattern,
  rankExistingSongsForNewRegister,
  sameCompactArtistTitle,
  shouldSurfaceExistingSongMatch,
  songTitleSearchToken,
} from '@/lib/admin-new-song-existing-match';
import { compactArtistSetKey } from '@/lib/song-alternate-pv-match';

assert.equal(escapeIlikePattern('a%b_c'), 'a\\%b\\_c');
assert.equal(songTitleSearchToken('Still (Official Video)'), 'Still');
assert.equal(songTitleSearchToken('Still (Visualizer)'), 'Still');

const patterns = buildExistingSongIlikePatterns('KAROL G, Bruno Mars', 'Still');
assert.equal(patterns.titleLike, '%Still%');
assert.equal(patterns.artistPrimaryLike, '%KAROL G%');
assert.ok(patterns.displayLike?.includes('KAROL G'));
assert.ok(patterns.displayLike?.includes('Still'));

assert.equal(shouldSurfaceExistingSongMatch('high'), true);
assert.equal(shouldSurfaceExistingSongMatch('medium'), true);
assert.equal(shouldSurfaceExistingSongMatch('low'), false);
assert.equal(shouldSurfaceExistingSongMatch('reject'), false);

assert.equal(
  compactArtistSetKey('KAROL G, Bruno Mars'),
  compactArtistSetKey('Bruno Mars, KAROL G'),
);
assert.ok(sameCompactArtistTitle('KAROL G, Bruno Mars', 'Still', 'Bruno Mars, KAROL G', 'Still'));

const ranked = rankExistingSongsForNewRegister({
  incomingArtist: 'KAROL G, Bruno Mars',
  incomingTitle: 'Still',
  incomingYoutubeTitle: 'KAROL G, Bruno Mars - Still (Official Video)',
  incomingDescription: '#Still #KarolG #BrunoMars',
  youtubeId: 'aQXq3ndLkHs',
  rows: [
    {
      id: 'song-still',
      display_title: 'KAROL G - Still',
      main_artist: 'KAROL G',
      song_title: 'Still',
    },
    {
      id: 'song-commodores',
      display_title: 'Commodores - Still',
      main_artist: 'Commodores',
      song_title: 'Still',
    },
    {
      id: 'song-other',
      display_title: 'KAROL G - Other',
      main_artist: 'KAROL G',
      song_title: 'Other',
    },
  ],
  videosBySongId: new Map([
    ['song-still', [{ videoId: 'p2lJGKVIGvU' }]],
    ['song-commodores', [{ videoId: 'commodores' }]],
    ['song-other', [{ videoId: 'xxxxxxxx' }]],
  ]),
});

assert.equal(ranked.length, 1);
assert.equal(ranked[0]?.songId, 'song-still');
assert.equal(ranked[0]?.match.level, 'high');
assert.equal(ranked[0]?.alreadyHasVideo, false);
assert.equal(ranked[0]?.videoCount, 1);

const already = rankExistingSongsForNewRegister({
  incomingArtist: 'KAROL G, Bruno Mars',
  incomingTitle: 'Still',
  youtubeId: 'p2lJGKVIGvU',
  rows: [
    {
      id: 'song-still',
      display_title: 'KAROL G, Bruno Mars - Still',
      main_artist: 'KAROL G, Bruno Mars',
      song_title: 'Still',
    },
  ],
  videosBySongId: new Map([['song-still', [{ videoId: 'p2lJGKVIGvU' }]]]),
});
assert.equal(already[0]?.alreadyHasVideo, true);

console.log('admin-new-song-existing-match.unit-test: ok');
