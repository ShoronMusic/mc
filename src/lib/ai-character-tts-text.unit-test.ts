import assert from 'node:assert/strict';
import { prepareAiCharacterTtsText } from './ai-character-tts-text';

assert.equal(prepareAiCharacterTtsText('【AIキャラ】 いい選曲ですね。'), 'いい選曲ですね。');

const withUrl =
  '【AIキャラ】Radiohead を選びました。\nhttps://www.youtube.com/watch?v=abc123';
assert.equal(prepareAiCharacterTtsText(withUrl), 'Radiohead を選びました。');

assert.equal(prepareAiCharacterTtsText('https://youtu.be/abc123'), '');

assert.equal(
  prepareAiCharacterTtsText(
    'Oasis - Wonderwallをどうぞ！前の曲と同じ90年代ブリットポップで、少し落ち着きつつも親しみやすいムードにぴったりです。',
  ),
  '前の曲と同じ90年代ブリットポップで、少し落ち着きつつも親しみやすいムードにぴったりです。',
);

assert.equal(
  prepareAiCharacterTtsText(
    'Oasis - Wonderwallをどうぞ！前の曲と同じ90年代ブリットポップで、少し落ち着きつつも親しみやすいムードにぴったりです。',
    { leadArtistJa: 'オアシス' },
  ),
  'オアシスをどうぞ！前の曲と同じ90年代ブリットポップで、少し落ち着きつつも親しみやすいムードにぴったりです。',
);

assert.equal(
  prepareAiCharacterTtsText('【AIキャラ】 a-ha - Take On Meをどうぞ！グルーヴが気持ちいい一曲です。'),
  'グルーヴが気持ちいい一曲です。',
);

assert.equal(prepareAiCharacterTtsText('この1曲です。\nhttps://youtu.be/abc'), 'この1曲です。');

assert.equal(
  prepareAiCharacterTtsText(
    'ろんさんの選曲、素晴らしいですね！Bon Joviの「It\'s My Life」、この曲のキャッチーなメロディと、グッとくる展開が最高です！',
  ),
  'ろんさんの選曲、素晴らしいですね！この曲のキャッチーなメロディと、グッとくる展開が最高です！',
);

console.log('ai-character-tts-text unit tests: OK');
