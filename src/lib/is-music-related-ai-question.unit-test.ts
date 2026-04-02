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

console.log('is-music-related-ai-question unit tests: OK');
