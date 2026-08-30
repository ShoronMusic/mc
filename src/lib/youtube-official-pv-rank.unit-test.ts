import assert from 'node:assert/strict';
import {
  hasOfficialPvPositiveSignal,
  looksLikeCompilationOrMixTitle,
  looksLikeCoverOrKaraokeUpload,
  looksLikeJapaneseMarketUpload,
  looksLikeUnusableAgentSongQuery,
  pickBestOfficialPvSearchHit,
  scoreYoutubeHitForOfficialPv,
} from './youtube-official-pv-rank';

assert.equal(
  looksLikeJapaneseMarketUpload(
    'ワーナーミュージック・ジャパン 洋楽 - 聴いたら泣いてしまう洋楽No.1 #seeyouagain #ワイスピ',
    'Warner Music Japan',
  ),
  true,
);
assert.equal(
  looksLikeCompilationOrMixTitle(
    'ワーナーミュージック・ジャパン 洋楽 - 聴いたら泣いてしまう洋楽No.1 #seeyouagain #ワイスピ',
    'Warner Music Japan',
  ),
  true,
);
assert.equal(
  looksLikeJapaneseMarketUpload('Wiz Khalifa - See You Again ft. Charlie Puth (Official Video)', 'WizKhalifaVEVO'),
  false,
);

const compilation = {
  title: 'ワーナーミュージック・ジャパン 洋楽 - 聴いたら泣いてしまう洋楽No.1 #seeyouagain #ワイスピ',
  channelTitle: 'Warner Music Japan',
};
const official = {
  title: 'Wiz Khalifa - See You Again ft. Charlie Puth (Official Video)',
  channelTitle: 'WizKhalifaVEVO',
};
assert.ok(scoreYoutubeHitForOfficialPv(compilation) < 0);
assert.ok(scoreYoutubeHitForOfficialPv(official) > 0);
assert.equal(pickBestOfficialPvSearchHit([compilation, official])?.channelTitle, 'WizKhalifaVEVO');
assert.equal(pickBestOfficialPvSearchHit([compilation]), null);

const workBgm = {
  title: 'PF CREATIVE - 壮大なBGM集①【作業用BGM】〈あなたを映画の主人公に一瞬で変える｜シネマティック｜EpicMusic〉',
  channelTitle: 'PF CREATIVE',
};
assert.equal(looksLikeJapaneseMarketUpload(workBgm.title, workBgm.channelTitle), true);
assert.equal(looksLikeCompilationOrMixTitle(workBgm.title, workBgm.channelTitle), true);
assert.equal(hasOfficialPvPositiveSignal(workBgm), false);
assert.ok(scoreYoutubeHitForOfficialPv(workBgm) < 0);
assert.equal(pickBestOfficialPvSearchHit([workBgm, official])?.channelTitle, 'WizKhalifaVEVO');
assert.equal(pickBestOfficialPvSearchHit([workBgm]), null);
assert.equal(looksLikeUnusableAgentSongQuery(workBgm.title), true);
assert.equal(looksLikeUnusableAgentSongQuery('Wiz Khalifa See You Again'), false);

const hyphenOnlyReupload = {
  title: 'Some Channel - Random Upload',
  channelTitle: 'randomuploader99',
};
assert.equal(hasOfficialPvPositiveSignal(hyphenOnlyReupload), false);
assert.equal(pickBestOfficialPvSearchHit([hyphenOnlyReupload]), null);

const coverHit = {
  title: 'ALL FOR LOVE (COVER) - AXL RAMANDA, DIMAS SENOPATI, SATRIO SABDA TAMA',
  channelTitle: 'AXL RAMANDA Official',
};
assert.equal(looksLikeCoverOrKaraokeUpload(coverHit.title, coverHit.channelTitle), true);
assert.equal(hasOfficialPvPositiveSignal(coverHit), false);
assert.ok(scoreYoutubeHitForOfficialPv(coverHit) < 0);
assert.equal(pickBestOfficialPvSearchHit([coverHit, official])?.channelTitle, 'WizKhalifaVEVO');
assert.equal(pickBestOfficialPvSearchHit([coverHit]), null);
assert.equal(looksLikeUnusableAgentSongQuery('ALL FOR LOVE COVER AXL RAMANDA'), true);

console.log('youtube-official-pv-rank.unit-test.ts: ok');
