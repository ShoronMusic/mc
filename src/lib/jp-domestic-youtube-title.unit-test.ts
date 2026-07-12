import {
  parseArtistSongFromCornerBracketTitle,
  parseArtistSongFromJpBilingualHyphenTitle,
  parseArtistSongFromJpHyphenTitleSlashEnArtist,
  parseArtistSongFromJpSlashTitle,
  resolveDomesticArtistSongFromYoutube,
  stripJpOfficialVideoDecorations,
} from './jp-domestic-youtube-title';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(
  stripJpOfficialVideoDecorations('サカナクション / 夜の踊り子 -Music Video-') === 'サカナクション / 夜の踊り子',
  'strip mv decoration',
);

const slash = parseArtistSongFromJpSlashTitle('サカナクション / 夜の踊り子 -Music Video-');
assert(slash?.artist === 'サカナクション' && slash?.song === '夜の踊り子', 'jp slash parse');

const resolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: 'サカナクション / 夜の踊り子 -Music Video-',
  channelTitle: 'サカナクション sakanaction',
});
assert(
  resolved?.displayTitle === 'サカナクション - 夜の踊り子' &&
    resolved.mainArtist === 'サカナクション' &&
    resolved.songTitle === '夜の踊り子' &&
    resolved.source === 'jp_slash',
  'sakanaction official mv title',
);

const noSlash = resolveDomesticArtistSongFromYoutube({
  rawTitle: '夜の踊り子 -Music Video-',
  channelTitle: 'サカナクション sakanaction',
});
assert(
  noSlash?.displayTitle === 'サカナクション - 夜の踊り子' && noSlash.source === 'channel_and_title',
  'channel + stripped title fallback',
);

const yonezu = parseArtistSongFromJpBilingualHyphenTitle('米津玄師 - 烏 Kenshi Yonezu - Karasu');
assert(yonezu?.artist === '米津玄師' && yonezu?.song === '烏', 'yonezu bilingual hyphen parse');

const yonezuResolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: '米津玄師 - 烏 Kenshi Yonezu - Karasu',
  channelTitle: 'Kenshi Yonezu 米津玄師',
});
assert(
  yonezuResolved?.displayTitle === '米津玄師 - 烏' &&
    yonezuResolved.mainArtist === '米津玄師' &&
    yonezuResolved.songTitle === '烏' &&
    yonezuResolved.source === 'jp_bilingual_hyphen',
  'yonezu official title',
);

// 公式によくある「日本語名 - 曲名 / English Artist」
const flamingoParsed = parseArtistSongFromJpHyphenTitleSlashEnArtist(
  '米津玄師 - Flamingo / Kenshi Yonezu',
);
assert(
  flamingoParsed?.artist === '米津玄師' && flamingoParsed?.song === 'Flamingo',
  'flamingo hyphen-slash parse',
);
assert(
  parseArtistSongFromJpSlashTitle('米津玄師 - Flamingo / Kenshi Yonezu') === null,
  'slash must not steal hyphen-slash titles',
);

const flamingoResolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: '米津玄師 - Flamingo / Kenshi Yonezu',
  channelTitle: 'Kenshi Yonezu 米津玄師',
});
assert(
  flamingoResolved?.displayTitle === '米津玄師 - Flamingo' &&
    flamingoResolved.songTitle === 'Flamingo' &&
    flamingoResolved.source === 'jp_hyphen_slash_en',
  'flamingo official title',
);

const teenageRiot = resolveDomesticArtistSongFromYoutube({
  rawTitle: '米津玄師 - TEENAGE RIOT / Kenshi Yonezu',
  channelTitle: 'Kenshi Yonezu 米津玄師',
});
assert(
  teenageRiot?.songTitle === 'TEENAGE RIOT' && teenageRiot.mainArtist === '米津玄師',
  'teenage riot title',
);

const fujii = resolveDomesticArtistSongFromYoutube({
  rawTitle: '藤井 風 - 満ちてゆく Official Video',
  channelTitle: 'Fujii Kaze',
});
assert(
  fujii?.displayTitle === '藤井 風 - 満ちてゆく' &&
    fujii.mainArtist === '藤井 風' &&
    fujii.songTitle === '満ちてゆく' &&
    fujii.source === 'jp_bilingual_hyphen',
  'fujii kaze hyphen title',
);

assert(
  stripJpOfficialVideoDecorations('Mr.Children 「Tomorrow never knows」 MUSIC VIDEO') ===
    'Mr.Children 「Tomorrow never knows」',
  'strip trailing music video',
);

assert(
  stripJpOfficialVideoDecorations('宇多田ヒカル「Mine or Yours」Music Video') ===
    '宇多田ヒカル「Mine or Yours」',
  'strip music video without space after corner bracket',
);

const utadaMine = parseArtistSongFromCornerBracketTitle(
  '宇多田ヒカル「Mine or Yours」Music Video',
);
assert(
  utadaMine?.artist === '宇多田ヒカル' && utadaMine?.song === 'Mine or Yours',
  'utada corner + Music Video',
);

const utadaViz = parseArtistSongFromCornerBracketTitle(
  '宇多田ヒカル「Electricity (Arca Remix)」official visualizer',
);
assert(
  utadaViz?.artist === '宇多田ヒカル' && utadaViz?.song === 'Electricity (Arca Remix)',
  'utada corner + official visualizer',
);

const utadaResolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: '宇多田ヒカル「桜流し」Music Video(4K UPGRADE)',
  channelTitle: '宇多田ヒカル',
});
assert(
  utadaResolved?.songTitle === '桜流し' &&
    utadaResolved.mainArtist === '宇多田ヒカル' &&
    utadaResolved.source === 'jp_corner_bracket',
  'utada sakura nagashi 4k upgrade',
);

const mrChildrenCorner = parseArtistSongFromCornerBracketTitle(
  'Mr.Children 「Tomorrow never knows」 MUSIC VIDEO',
);
assert(
  mrChildrenCorner?.artist === 'Mr.Children' && mrChildrenCorner?.song === 'Tomorrow never knows',
  'mrchildren corner bracket parse',
);

const mrChildrenResolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: 'Mr.Children 「Tomorrow never knows」 MUSIC VIDEO',
  channelTitle: 'Mr.Children Official Channel',
  resolvedArtist: 'Mr.children Official Channel',
  resolvedSong: 'Mr.children 「Tomorrow Never Knows」',
});
assert(
  mrChildrenResolved?.displayTitle === 'Mr.Children - Tomorrow never knows' &&
    mrChildrenResolved.mainArtist === 'Mr.Children' &&
    mrChildrenResolved.songTitle === 'Tomorrow never knows' &&
    mrChildrenResolved.source === 'jp_corner_bracket',
  'mrchildren official mv title',
);

// レーベル ch + 「Artist - 『曲名』 リリックビデオ」→ タイトルのアーティストを正とする
const mrsGreenLyric = parseArtistSongFromCornerBracketTitle(
  'Mrs. GREEN APPLE - 「僕のこと」 リリックビデオ short version',
);
assert(
  mrsGreenLyric?.artist === 'Mrs. GREEN APPLE' && mrsGreenLyric?.song === '僕のこと',
  'mrs green apple corner with dash before bracket',
);

const mrsGreenResolved = resolveDomesticArtistSongFromYoutube({
  rawTitle: 'Mrs. GREEN APPLE - 「僕のこと」 リリックビデオ short version',
  channelTitle: 'UNIVERSAL MUSIC JAPAN',
  resolvedArtist: 'UNIVERSAL MUSIC JAPAN',
  resolvedSong: '僕のこと',
});
assert(
  mrsGreenResolved?.displayTitle === 'Mrs. GREEN APPLE - 僕のこと' &&
    mrsGreenResolved.mainArtist === 'Mrs. GREEN APPLE' &&
    mrsGreenResolved.songTitle === '僕のこと' &&
    mrsGreenResolved.source === 'jp_corner_bracket',
  'mrs green apple lyric video on label channel',
);

const yonezu1991 = resolveDomesticArtistSongFromYoutube({
  rawTitle: '米津玄師  Kenshi Yonezu -  1991',
  channelTitle: 'Kenshi Yonezu  米津玄師',
  resolvedArtist: '米津玄師 Kenshi Yonezu',
  resolvedSong: '1991',
});
assert(
  yonezu1991?.displayTitle === '米津玄師 - 1991' &&
    yonezu1991.mainArtist === '米津玄師' &&
    yonezu1991.songTitle === '1991' &&
    yonezu1991.source === 'resolved',
  'yonezu ascii title from resolved parse',
);

console.log('jp-domestic-youtube-title.unit-test.ts: ok');
