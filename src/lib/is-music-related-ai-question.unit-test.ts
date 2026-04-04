import assert from 'node:assert/strict';
import { isMusicRelatedAiQuestion } from './is-music-related-ai-question';

assert.equal(isMusicRelatedAiQuestion('タイトルはkirieですよね？'), true);
assert.equal(isMusicRelatedAiQuestion('タイトルは Kyrie ですよね？'), true);
assert.equal(isMusicRelatedAiQuestion('What is the title of this song?'), true);
assert.equal(isMusicRelatedAiQuestion('この曲の歌詞の意味は？'), true);
assert.equal(
  isMusicRelatedAiQuestion('この時代に流行ったシンセポップはありますか？'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('今日の天気は？'), false);
assert.equal(
  isMusicRelatedAiQuestion('ケイシーはグラミー賞取ったんですよね'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('この曲はオスカー主題歌だった？'), true);
assert.equal(isMusicRelatedAiQuestion('コーチェラで見たいアーティストは？'), true);
assert.equal(isMusicRelatedAiQuestion('オリコンで何位だった？'), true);
assert.equal(isMusicRelatedAiQuestion('Did they win a Grammy?'), true);
assert.equal(
  isMusicRelatedAiQuestion('彼はこれで賞を獲ったのですか？'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('Did this win any awards?'), true);
assert.equal(
  isMusicRelatedAiQuestion('この年の年間NO1ソングは？'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('What was the #1 hit that year?'), true);
assert.equal(isMusicRelatedAiQuestion('オリジナルは誰ですか？'), true);
assert.equal(isMusicRelatedAiQuestion('原曲は誰が歌ってますか？'), true);
assert.equal(isMusicRelatedAiQuestion('Who did the original version?'), true);

console.log('is-music-related-ai-question unit tests: OK');
