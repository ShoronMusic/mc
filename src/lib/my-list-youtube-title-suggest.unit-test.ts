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

// YT_ARTIST_TITLE_MODE=mylist_oembed: ダッシュ前後にスペースが無いと従来 split が死んで XL Recordings がアーティストになる（rmHDhAohJlQ）
const p12 = resolveOEmbedToMyListStylePack('The Prodigy-Breathe (Official Video)', 'XL Recordings');
assert(p12.artistDisplay === 'The Prodigy', `p12 artistDisplay: ${p12.artistDisplay}`);
assert(p12.song === 'Breathe', `p12 song: ${p12.song}`);

const p13 = resolveOEmbedToMyListStylePack('The Prodigy - Breathe (Official Video)', 'XL Recordings');
assert(p13.artistDisplay === 'The Prodigy', `p13 artistDisplay: ${p13.artistDisplay}`);
assert(p13.song === 'Breathe', `p13 song: ${p13.song}`);

// 末尾 (… Mix) はアーティストではなく曲バージョン。Topic チャンネル名をアーティストにする（fXfh65sFvMQ）
const p14 = resolveOEmbedToMyListStylePack('Planet Rock (Swordfish Mix)', 'Paul Oakenfold - Topic');
assert(
  p14.artistDisplay === 'Paul Oakenfold',
  `p14 artistDisplay: ${p14.artistDisplay}`,
);
assert(
  p14.song.includes('Planet Rock') && p14.song.includes('Swordfish'),
  `p14 song: ${p14.song}`,
);

// 個人アップローダー（チャンネル風でない）＋「アーティスト - 曲」→ タイトル優先（D2Vtnf7rr1Q 型）
const p15 = resolveOEmbedToMyListStylePack('Parov Stelar - Diamonds', 'nikos791');
assert(p15.artistDisplay === 'Parov Stelar', `p15 artistDisplay: ${p15.artistDisplay}`);
assert(p15.song === 'Diamonds', `p15 song: ${p15.song}`);

// 曲名 [Official …] - 共演アーティスト（公式が曲先・共演後のとき逆順）
const p16 = resolveOEmbedToMyListStylePack(
  'A Light That Never Comes [Official Music Video] - Linkin Park X Steve Aoki',
  'Linkin Park',
);
assert(
  p16.artistDisplay === 'Linkin Park X Steve Aoki',
  `p16 artistDisplay: ${p16.artistDisplay}`,
);
assert(
  p16.song === 'A Light That Never Comes',
  `p16 song: ${p16.song}`,
);

// HYBE 公式: ハイフン無し・「アーティスト '曲' Official MV」（kTlv5_Bs8aw）
const p17 = resolveOEmbedToMyListStylePack(
  "BTS (방탄소년단) 'MIC Drop (Steve Aoki Remix)' Official MV",
  'HYBE LABELS',
);
assert(
  p17.artistDisplay === 'BTS (방탄소년단)',
  `p17 artistDisplay: ${p17.artistDisplay}`,
);
assert(
  p17.song.includes('MIC Drop') && p17.song.includes('Steve Aoki'),
  `p17 song: ${p17.song}`,
);

// パイプ区切り（Artist | Song）を正しく分解する（RBumgq5yVrA）
const p18 = resolveOEmbedToMyListStylePack('Passenger | Let Her Go (Official Video)', 'Passenger');
assert(p18.artistDisplay === 'Passenger', `p18 artistDisplay: ${p18.artistDisplay}`);
assert(p18.song === 'Let Her Go', `p18 song: ${p18.song}`);

console.log('my-list-youtube-title-suggest unit tests: OK');
