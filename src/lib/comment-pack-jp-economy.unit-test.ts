/**
 * 純粋関数の検証: `npx tsx src/lib/comment-pack-jp-economy.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { shouldUseJapaneseEconomyCommentPack } from './comment-pack-jp-economy';

const prev = process.env.COMMENT_PACK_JP_ECONOMY;
process.env.COMMENT_PACK_JP_ECONOMY = '1';

try {
  // 洋楽の来日ライブ: 概要に日本語だけ → 邦楽節約トリガーにしない
  assert.equal(
    shouldUseJapaneseEconomyCommentPack({
      title: 'Mr. Big - Green-Tinted Sixties Mind (Live in Tokyo, 1991)',
      artistDisplay: 'Mr. Big',
      artist: 'Mr. Big',
      song: 'Green-Tinted Sixties Mind (Live in Tokyo, 1991)',
      description: '1991年東京公演のライブ映像です。高画質でお楽しみください。',
      channelTitle: 'MrBigVEVO',
      defaultAudioLanguage: 'en',
    }),
    false,
  );

  // 邦楽: 曲名に日本語
  assert.equal(
    shouldUseJapaneseEconomyCommentPack({
      title: 'Official髭男dism - Pretender',
      artistDisplay: 'Official髭男dism',
      artist: 'Official髭男dism',
      song: 'Pretender',
      description: null,
      channelTitle: null,
      defaultAudioLanguage: null,
    }),
    true,
  );

  // 音声 ja のみ → 従来どおり節約対象
  assert.equal(
    shouldUseJapaneseEconomyCommentPack({
      title: 'Some English Title',
      artistDisplay: 'Some Artist',
      artist: 'Some Artist',
      song: 'Some English Title',
      description: null,
      channelTitle: null,
      defaultAudioLanguage: 'ja',
    }),
    true,
  );

  // 主要メタに日本語が無く、チャンネル名だけ日本語 → 英字主体ならトリガーにしない（MB 側に委ねる）
  assert.equal(
    shouldUseJapaneseEconomyCommentPack({
      title: 'Green-Tinted Sixties Mind (Live in Tokyo, 1991)',
      artistDisplay: 'Mr. Big',
      artist: 'Mr. Big',
      song: 'Green-Tinted Sixties Mind (Live in Tokyo, 1991)',
      description: null,
      channelTitle: '洋楽ライブチャンネル',
      defaultAudioLanguage: null,
    }),
    false,
  );

  // メタが乏しい（英字の十分な長さが無い）＋ 概要に日本語 → 従来どおり節約（安全側）
  assert.equal(
    shouldUseJapaneseEconomyCommentPack({
      title: 'X',
      artistDisplay: 'A',
      artist: 'A',
      song: 'X',
      description: '日本語の説明だけが手掛かり',
      channelTitle: null,
      defaultAudioLanguage: null,
    }),
    true,
  );
} finally {
  if (prev === undefined) delete process.env.COMMENT_PACK_JP_ECONOMY;
  else process.env.COMMENT_PACK_JP_ECONOMY = prev;
}

console.log('comment-pack-jp-economy unit tests: OK');
