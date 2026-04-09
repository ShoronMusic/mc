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
assert.equal(
  isMusicRelatedAiQuestion('デビュー当時はブリトニーとよく比較されなかった？'),
  true,
);
assert.equal(
  isMusicRelatedAiQuestion('デビュー当時はブリトニー・スピアーズとよく比較されなかった？'),
  true,
);
assert.equal(
  isMusicRelatedAiQuestion('でもこの頃彼女は大きな病気になったとか？'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('この頃活動休止してた時期ありましたよね？'), true);
assert.equal(isMusicRelatedAiQuestion('頭痛が続くんですが何科に行けばいいですか？'), false);
assert.equal(
  isMusicRelatedAiQuestion('Avril LavigneはMGKとのコラボもあったね？'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('この曲のfeat.は誰？'), true);
assert.equal(
  isMusicRelatedAiQuestion('Avril Lavigneの来日歴は分かりますか？'),
  true,
);
assert.equal(
  isMusicRelatedAiQuestion('Machine Gun Kellyの来日歴は分かりますか？'),
  true,
);
assert.equal(
  isMusicRelatedAiQuestion('曲名が思い出せなくて、ドラマで流れてたやつ'),
  true,
);
assert.equal(
  isMusicRelatedAiQuestion('サビでナナナって言ってるだけのやつ当てて'),
  true,
);
assert.equal(isMusicRelatedAiQuestion('What song was that in the ad?'), true);

console.log('is-music-related-ai-question unit tests: OK');
