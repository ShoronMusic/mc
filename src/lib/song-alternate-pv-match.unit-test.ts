/**
 * `npx tsx src/lib/song-alternate-pv-match.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  canAddSongVideoVariant,
  extractHashtagCompactKeys,
  inferSongVideoVariantFromTitle,
  matchAlternatePvToExistingSong,
  shouldBackfillSongVideoVariant,
  MAX_SONG_VIDEO_VARIANTS,
} from '@/lib/song-alternate-pv-match';
import { compactMatchKey } from '@/lib/song-registration-normalize';

assert.equal(compactMatchKey('p a r a d 0 x 1 c'), 'parad0x1c');
assert.equal(compactMatchKey('parad0x1c'), 'parad0x1c');

const starset = matchAlternatePvToExistingSong({
  existingArtist: 'STARSET',
  existingTitle: 'parad0x1c',
  incomingArtist: 'STARSET',
  incomingTitle: 'p a r a d 0 x 1 c',
  incomingYoutubeTitle: 'STARSET - p a r a d 0 x 1 c (Official Music Video)',
  incomingDescription: "The official music video for 'p a r a d 0 x 1 c' by STARSET #starset #parad0x1c",
  incomingChannelId: 'UCSTARSET',
  existingChannelIds: ['UCSTARSET'],
});
assert.equal(starset.level, 'high');
assert.equal(starset.compactIncomingTitle, 'parad0x1c');
assert.ok(starset.reasons.some((r) => r.includes('曲名が一致')));

const otherSong = matchAlternatePvToExistingSong({
  existingArtist: 'STARSET',
  existingTitle: 'My Demons',
  incomingArtist: 'STARSET',
  incomingTitle: 'p a r a d 0 x 1 c',
  incomingYoutubeTitle: 'STARSET - p a r a d 0 x 1 c (Official Music Video)',
});
assert.equal(otherSong.level, 'low');

const cover = matchAlternatePvToExistingSong({
  existingArtist: 'STARSET',
  existingTitle: 'parad0x1c',
  incomingArtist: 'Someone',
  incomingTitle: 'parad0x1c',
  incomingYoutubeTitle: 'STARSET - parad0x1c (cover)',
});
assert.equal(cover.level, 'reject');

const karolOrder = matchAlternatePvToExistingSong({
  existingArtist: 'KAROL G, Bruno Mars',
  existingTitle: 'Still',
  incomingArtist: 'Bruno Mars, KAROL G',
  incomingTitle: 'Still',
  incomingYoutubeTitle: 'KAROL G, Bruno Mars - Still (Official Video)',
});
assert.equal(karolOrder.level, 'high');

const karolMainOnly = matchAlternatePvToExistingSong({
  existingArtist: 'KAROL G',
  existingTitle: 'Still',
  incomingArtist: 'KAROL G, Bruno Mars',
  incomingTitle: 'Still',
  incomingYoutubeTitle: 'KAROL G, Bruno Mars - Still (Official Video)',
  incomingDescription: '#Still #KarolG #BrunoMars',
});
assert.equal(karolMainOnly.level, 'high');
assert.ok(karolMainOnly.reasons.some((r) => r.includes('重複')));

const shortHashtagNoise = matchAlternatePvToExistingSong({
  existingArtist: 'Commodores',
  existingTitle: 'Still',
  incomingArtist: 'KAROL G, Bruno Mars',
  incomingTitle: 'Still',
  incomingYoutubeTitle: 'KAROL G, Bruno Mars - Still (Official Video)',
  incomingDescription: '#Still #KarolG',
});
assert.equal(shortHashtagNoise.level, 'low');

assert.equal(inferSongVideoVariantFromTitle('STARSET - x (Official Lyric Video)'), 'lyric');
assert.equal(inferSongVideoVariantFromTitle('STARSET - x (Official Music Video)'), 'official');
assert.equal(inferSongVideoVariantFromTitle('KAROL G - Still (Visualizer)'), 'visualizer');
assert.equal(inferSongVideoVariantFromTitle('KAROL G - Still (Official Visualizer)'), 'visualizer');

assert.equal(shouldBackfillSongVideoVariant(null, 'visualizer'), true);
assert.equal(shouldBackfillSongVideoVariant('official', 'visualizer'), true);
assert.equal(shouldBackfillSongVideoVariant('visualizer', 'visualizer'), false);
assert.equal(shouldBackfillSongVideoVariant('lyric', 'official'), false);
assert.deepEqual(extractHashtagCompactKeys('#starset #parad0x1c'), ['starset', 'parad0x1c']);

assert.equal(canAddSongVideoVariant({ currentCount: 5, alreadyOnThisSong: false }).ok, false);
assert.equal(canAddSongVideoVariant({ currentCount: 5, alreadyOnThisSong: true }).ok, true);
assert.equal(MAX_SONG_VIDEO_VARIANTS, 5);

console.log('song-alternate-pv-match.unit-test: ok');
