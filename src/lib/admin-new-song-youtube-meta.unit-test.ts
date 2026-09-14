/**
 * `npx tsx src/lib/admin-new-song-youtube-meta.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  looksLikeYoutubeWatchPageChromeMeta,
  queryTitleAgreesWithYoutubeTitle,
  resolveAdminNewSongMetaFromYoutube,
  youtubeSongTitleKeepsWithAsTitle,
} from '@/lib/admin-new-song-youtube-meta';

assert.equal(
  looksLikeYoutubeWatchPageChromeMeta('Bowen Hills QLD, オーストラリア', '一番近いイベント'),
  true,
);
assert.equal(looksLikeYoutubeWatchPageChromeMeta('The All-American Rejects', "I've Been Everywhere"), false);

assert.equal(
  queryTitleAgreesWithYoutubeTitle("I've Been Everywhere", "I've Been Everywhere"),
  true,
);
assert.equal(
  queryTitleAgreesWithYoutubeTitle('Still', 'KAROL G, Bruno Mars - Still (Official Video)'),
  true,
);
assert.equal(
  queryTitleAgreesWithYoutubeTitle('一番近いイベント', "I've Been Everywhere"),
  false,
);
assert.equal(queryTitleAgreesWithYoutubeTitle('Stay', 'Kalax - Stay With Me'), false);
assert.equal(
  queryTitleAgreesWithYoutubeTitle('Stay With Me', 'Kalax - Stay With Me (Official Video)'),
  true,
);
assert.equal(youtubeSongTitleKeepsWithAsTitle('Stay With Me'), true);
assert.equal(youtubeSongTitleKeepsWithAsTitle('Stay'), false);

const stayWithMe = resolveAdminNewSongMetaFromYoutube({
  queryArtist: 'Kalax, Me',
  queryTitle: 'Stay',
  youtubeTitle: 'Kalax - Stay With Me (Official Video)',
  youtubeChannelTitle: 'Kalax',
});
assert.equal(stayWithMe.corrected, true);
assert.equal(stayWithMe.artist, 'Kalax');
assert.equal(stayWithMe.title, 'Stay With Me');

const rejectedCover = resolveAdminNewSongMetaFromYoutube({
  queryArtist: 'Bowen Hills QLD, オーストラリア',
  queryTitle: '一番近いイベント',
  youtubeTitle: "I've Been Everywhere",
  youtubeChannelTitle: 'The All-American Rejects',
});
assert.equal(rejectedCover.corrected, true);
assert.equal(rejectedCover.title, "I've Been Everywhere");
assert.match(rejectedCover.artist, /All-American Rejects/i);

const keepExtensionParse = resolveAdminNewSongMetaFromYoutube({
  queryArtist: 'KAROL G, Bruno Mars',
  queryTitle: 'Still',
  youtubeTitle: 'KAROL G, Bruno Mars - Still (Official Video)',
  youtubeChannelTitle: 'KAROL G',
});
assert.equal(keepExtensionParse.corrected, false);
assert.equal(keepExtensionParse.artist, 'KAROL G, Bruno Mars');
assert.equal(keepExtensionParse.title, 'Still');

const noSnippet = resolveAdminNewSongMetaFromYoutube({
  queryArtist: 'Bowen Hills QLD, オーストラリア',
  queryTitle: '一番近いイベント',
  youtubeTitle: null,
  youtubeChannelTitle: null,
});
assert.equal(noSnippet.corrected, false);

console.log('admin-new-song-youtube-meta.unit-test ok');
