import {
  cleanMyListSongTitle,
  isLikelyYoutubeChannelUploader,
  joinMyListArtistsForStorage,
  parseCommaSeparatedArtists,
  splitTitleAtFirstSpacedDash,
  suggestMyListArtistTitleFromYoutubeStyle,
} from './my-list-youtube-title-suggest';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertArraysEqual(a: string[], b: string[], msg: string) {
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(`${msg}: got [${a.join(' | ')}] expected [${b.join(' | ')}]`);
  }
}

// The Police 例
const r1 = suggestMyListArtistTitleFromYoutubeStyle(
  'ThePoliceVEVO',
  'The Police - Every Breath You Take (Official Music Video)',
);
assertArraysEqual(r1.artists, ['The Police'], 'r1 artists');
assert(r1.title === 'Every Breath You Take', `r1 title: ${r1.title}`);

assert(isLikelyYoutubeChannelUploader('ThePoliceVEVO'), 'ThePoliceVEVO channel');
assert(!isLikelyYoutubeChannelUploader('The Police'), 'The Police not channel');

const r2 = suggestMyListArtistTitleFromYoutubeStyle(
  'The Police',
  'The Police - Roxanne (Official Music Video)',
);
assertArraysEqual(r2.artists, ['The Police'], 'r2 artists');
assert(r2.title === 'Roxanne', `r2 title: ${r2.title}`);

// 複数アーティスト + 曲名にハイフン（Non-Film）
const r3 = suggestMyListArtistTitleFromYoutubeStyle(
  'BryanAdamsVEVO',
  'Bryan Adams, Rod Stewart, Sting - All For Love (Non-Film Version)',
);
assertArraysEqual(
  r3.artists,
  ['Bryan Adams', 'Rod Stewart', 'Sting'],
  'r3 artists',
);
assert(r3.title === 'All For Love', `r3 title: ${r3.title}`);

const r4 = suggestMyListArtistTitleFromYoutubeStyle(null, 'AC/DC - Highway to Hell (Official Video)');
assertArraysEqual(r4.artists, ['AC/DC'], 'r4 artists');
assert(r4.title === 'Highway to Hell', `r4 title: ${r4.title}`);

assert(
  splitTitleAtFirstSpacedDash('A - B - C')!.right === 'B - C',
  'first dash only',
);

assertArraysEqual(parseCommaSeparatedArtists('a, b, c'), ['a', 'b', 'c'], 'parse comma');

assert(joinMyListArtistsForStorage([' A ', '', 'B ']) === 'A, B', 'join storage');

assert(cleanMyListSongTitle('  Foo (Official Music Video)  ') === 'Foo', 'clean');

// 保存済み複数アーティスト + 清掃済みタイトル
const r5 = suggestMyListArtistTitleFromYoutubeStyle(
  'Bryan Adams, Rod Stewart, Sting',
  'All For Love',
);
assertArraysEqual(r5.artists, ['Bryan Adams', 'Rod Stewart', 'Sting'], 'r5 round-trip');
assert(r5.title === 'All For Love', `r5 title: ${r5.title}`);

console.log('my-list-youtube-title-suggest unit tests: OK');
