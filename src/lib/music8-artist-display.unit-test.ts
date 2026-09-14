/**
 * `npx tsx src/lib/music8-artist-display.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  getJapaneseDescription,
  normalizeYoutubeChannelRef,
  resolveYoutubeChannelHref,
  splitMusic8ArtistDescription,
} from '@/lib/music8-artist-display';

const splitPara = splitMusic8ArtistDescription(
  'XG is a Japanese girl group.\n\n日本出身のXGは、世界的な注目を集めるガールズグループ。',
);
assert.equal(splitPara.en, 'XG is a Japanese girl group.');
assert.equal(splitPara.ja, '日本出身のXGは、世界的な注目を集めるガールズグループ。');
assert.equal(getJapaneseDescription(splitPara.en + '\n\n' + splitPara.ja), splitPara.ja);

const mixed = splitMusic8ArtistDescription(
  'XG is a South Korea-based Japanese girl group. 日本出身のXGは世界的な注目を集める。',
);
assert.match(mixed.en, /South Korea-based/);
assert.match(mixed.ja, /日本出身/);

assert.equal(splitMusic8ArtistDescription('Only English bio.').ja, '');
assert.equal(splitMusic8ArtistDescription('日本語のみの紹介文。').en, '');

assert.equal(normalizeYoutubeChannelRef('UCUCeZaZeJbEYAAzvMgrKOPQ'), 'UCUCeZaZeJbEYAAzvMgrKOPQ');
assert.equal(normalizeYoutubeChannelRef('@ArtOfficialMusic'), '@ArtOfficialMusic');
assert.equal(
  normalizeYoutubeChannelRef('https://www.youtube.com/@ArtOfficialMusic'),
  '@ArtOfficialMusic',
);
assert.equal(
  normalizeYoutubeChannelRef('https://www.youtube.com/@ArtOfficialMusic?si=abc'),
  '@ArtOfficialMusic',
);
assert.equal(
  normalizeYoutubeChannelRef('https://www.youtube.com/channel/UCoUM-UJ7rirJYP8CQ0EIaHA'),
  'UCoUM-UJ7rirJYP8CQ0EIaHA',
);
assert.equal(resolveYoutubeChannelHref('@ArtOfficialMusic'), 'https://www.youtube.com/@ArtOfficialMusic');
assert.equal(
  resolveYoutubeChannelHref('https://www.youtube.com/@ArtOfficialMusic'),
  'https://www.youtube.com/@ArtOfficialMusic',
);
assert.equal(
  resolveYoutubeChannelHref('UCUCeZaZeJbEYAAzvMgrKOPQ'),
  'https://www.youtube.com/channel/UCUCeZaZeJbEYAAzvMgrKOPQ',
);

const dupJa = splitMusic8ArtistDescription(
  [
    'Bruno Mars is an American singer-songwriter, and musician.',
    'ブルーノ・マーズはアメリカのシンガーソングライター。',
    'ブルーノ・マーズはアメリカのシンガーソングライター。',
  ].join('\n\n'),
);
assert.equal(dupJa.en, 'Bruno Mars is an American singer-songwriter, and musician.');
assert.equal(dupJa.ja, 'ブルーノ・マーズはアメリカのシンガーソングライター。');

console.log('music8-artist-display.unit-test: ok');
