/**
 * `npx tsx src/lib/music8-song-intro-gemini.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  buildKnownFactsLines,
  buildMusic8SongIntroPrompt,
  formatMusic8SongIntroArtistTitle,
  looksIncompleteMusic8SongIntro,
} from '@/lib/music8-song-intro-gemini';

assert.equal(
  formatMusic8SongIntroArtistTitle('AURORA', 'All My Demons Greeting Me As A Friend'),
  'AURORA - All My Demons Greeting Me As A Friend',
);

const prompt = buildMusic8SongIntroPrompt({
  artistTitle: 'AURORA - All My Demons Greeting Me As A Friend',
  knownFacts: '- 原盤日: 2016-03-11',
});
assert.ok(prompt.includes('AURORA - All My Demons Greeting Me As A Friend'));
assert.ok(prompt.includes('180字未満は不合格'));
assert.ok(prompt.includes('創作しない'));

assert.equal(
  looksIncompleteMusic8SongIntro('ノルウェー出身のシンガーソングライターAuroraが、2026年9月'),
  true,
);
const completeIntro =
  'ノルウェー出身のシンガーソングライターAURORAが2016年3月、デビューアルバム『All My Demons Greeting Me As A Friend』から放った。闇を友として迎える歌詞は孤独と再生を描き、透き通るボーカルと電子音・民族的な旋律が交錯するアートポップ。北欧の冷気と祈りが重なり、闇を突き抜ける。';
assert.ok(completeIntro.length >= 150, `len=${completeIntro.length}`);
assert.equal(looksIncompleteMusic8SongIntro(completeIntro), false);
assert.ok(prompt.includes('です」「ます」'));
assert.ok(prompt.includes('原盤日: 2016-03-11'));
assert.ok(prompt.includes('制作ジャンルの断定ではない'));
assert.ok(prompt.includes('シンセやダンスビートを足さない'));
assert.equal(prompt.includes('%s'), false);

assert.equal(
  buildKnownFactsLines({ originalReleaseDate: '2016-03-11', style: 'Pop', vocal: 'F', genres: ['Art pop'] }),
  '- 原盤日: 2016-03-11\n- サイト分類スタイル（粗いナビ。制作ジャンルの断定には使わない）: Pop\n- ボーカル記号（F/M。本文では「男性ボーカル」「女性ボーカル」にしない。名前が無ければ「ボーカル」）: F\n- ジャンル: Art pop',
);
assert.ok(
  buildKnownFactsLines({
    style: 'Electronica',
    vocal: 'F',
    artistDisplay: 'Calvin Harris',
    hasNamedFeaturedArtist: false,
  }).includes('フィーチャー名がクレジットに無い'),
);
assert.ok(
  buildKnownFactsLines({
    style: 'Electronica',
    vocal: 'F',
    artistDisplay: 'Calvin Harris, Dua Lipa',
    hasNamedFeaturedArtist: true,
  }).includes('男性ボーカル」「女性ボーカル」にしない'),
);
assert.ok(prompt.includes('フィーチャー名がクレジットに無いときだけ'));
assert.ok(prompt.includes('バラードと分かる場合は'));

console.log('music8-song-intro-gemini.unit-test: ok');
