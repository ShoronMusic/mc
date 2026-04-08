import {
  cleanMyListSongTitle,
  isLikelyYoutubeChannelUploader,
  joinMyListArtistsForStorage,
  parseCommaSeparatedArtists,
  resolveOEmbedToMyListStylePack,
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
assert(isLikelyYoutubeChannelUploader('Queen Official'), 'Queen Official channel');
assert(isLikelyYoutubeChannelUploader('RHINO'), 'RHINO channel');
assert(isLikelyYoutubeChannelUploader('Louder Noise'), 'Louder Noise channel');
assert(isLikelyYoutubeChannelUploader('INXS Videos'), 'INXS Videos channel');

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
assert(
  cleanMyListSongTitle('Pride (In The Name Of Love) (Official Music Video) [HD]') ===
    'Pride (In The Name Of Love)',
  'keep title parentheses',
);

// 保存済み複数アーティスト + 清掃済みタイトル
const r5 = suggestMyListArtistTitleFromYoutubeStyle(
  'Bryan Adams, Rod Stewart, Sting',
  'All For Love',
);
assertArraysEqual(r5.artists, ['Bryan Adams', 'Rod Stewart', 'Sting'], 'r5 round-trip');
assert(r5.title === 'All For Love', `r5 title: ${r5.title}`);

const p1 = resolveOEmbedToMyListStylePack(
  'The Police - Every Breath You Take (Official Music Video)',
  'ThePoliceVEVO',
);
assert(p1.artistDisplay === 'The Police', `p1 artistDisplay: ${p1.artistDisplay}`);
assert(p1.song === 'Every Breath You Take', `p1 song: ${p1.song}`);

const p2 = resolveOEmbedToMyListStylePack(
  'Bryan Adams, Rod Stewart, Sting - All For Love (Non-Film Version)',
  'BryanAdamsVEVO',
);
assert(
  p2.artistDisplay === 'Bryan Adams, Rod Stewart, Sting',
  `p2 artistDisplay: ${p2.artistDisplay}`,
);
assert(p2.song === 'All For Love', `p2 song: ${p2.song}`);

const p3 = resolveOEmbedToMyListStylePack(
  'Queen Official - Queen and David Bowie - Under Pressure',
  'Queen Official',
);
assert(p3.artistDisplay === 'Queen, David Bowie', `p3 artistDisplay: ${p3.artistDisplay}`);
assert(p3.song === 'Under Pressure', `p3 song: ${p3.song}`);

const p4 = resolveOEmbedToMyListStylePack(
  'Queen and David Bowie - Under Pressure (Official Video)',
  'Queen Official',
);
assert(p4.artistDisplay === 'Queen, David Bowie', `p4 artistDisplay: ${p4.artistDisplay}`);
assert(p4.song === 'Under Pressure', `p4 song: ${p4.song}`);

const p5 = resolveOEmbedToMyListStylePack(
  'Journey - Separate Ways (Worlds Apart) (Official HD Video - 1983)',
  'journeyVEVO',
);
assert(p5.artistDisplay === 'Journey', `p5 artistDisplay: ${p5.artistDisplay}`);
assert(p5.song === 'Separate Ways (Worlds Apart)', `p5 song: ${p5.song}`);

const p6 = resolveOEmbedToMyListStylePack(
  "ZZ Top - Gimme All Your Lovin' (Official Music Video) [HD]",
  'RHINO',
);
assert(p6.artistDisplay === 'ZZ Top', `p6 artistDisplay: ${p6.artistDisplay}`);
assert(p6.song === "Gimme All Your Lovin'", `p6 song: ${p6.song}`);

const p7 = resolveOEmbedToMyListStylePack(
  'U2 - Pride (In The Name Of Love) (Official Music Video)',
  'U2',
);
assert(p7.artistDisplay === 'U2', `p7 artistDisplay: ${p7.artistDisplay}`);
assert(p7.song === 'Pride (In The Name Of Love)', `p7 song: ${p7.song}`);

const p8 = resolveOEmbedToMyListStylePack(
  "Mötley Crüe - Smokin' In The Boys Room (Official Video)",
  'Louder Noise',
);
assert(p8.artistDisplay === 'Mötley Crüe', `p8 artistDisplay: ${p8.artistDisplay}`);
assert(p8.song === "Smokin' In The Boys Room", `p8 song: ${p8.song}`);

const p9 = resolveOEmbedToMyListStylePack(
  'INXS - What You Need (Official Music Video)',
  'INXS Videos',
);
assert(p9.artistDisplay === 'INXS', `p9 artistDisplay: ${p9.artistDisplay}`);
assert(p9.song === 'What You Need', `p9 song: ${p9.song}`);

const p10 = resolveOEmbedToMyListStylePack(
  'Love is a Bitch Slap (Sebastian Bach)',
  'Darren Fitzpatrick',
);
assert(p10.artistDisplay === 'Sebastian Bach', `p10 artistDisplay: ${p10.artistDisplay}`);
assert(p10.song === 'Love is a Bitch Slap', `p10 song: ${p10.song}`);

const p11 = resolveOEmbedToMyListStylePack(
  "KISSIN' DYNAMITE - Money, Sex & Power (2012) // Official Music Video // AFM Records",
  'AFM Records',
);
assert(p11.artistDisplay === "KISSIN' DYNAMITE", `p11 artistDisplay: ${p11.artistDisplay}`);
assert(p11.song === 'Money, Sex & Power', `p11 song: ${p11.song}`);

console.log('my-list-youtube-title-suggest unit tests: OK');
