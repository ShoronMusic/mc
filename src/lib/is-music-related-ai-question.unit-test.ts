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

assert.equal(isMusicRelatedAiQuestion('ピンフロの初期でおすすめのアルバムは？'), true);
assert.equal(isMusicRelatedAiQuestion('ZEPPのドラマーって誰が有名？'), true);
assert.equal(isMusicRelatedAiQuestion('レッド・ツェッペリンの4thは何枚売れた？'), true);
assert.equal(isMusicRelatedAiQuestion('ミスチルのデビュー曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('レッチリのベーシストは今も同じ？'), true);
assert.equal(isMusicRelatedAiQuestion('サザンの夏の定番曲といえば？'), true);
assert.equal(isMusicRelatedAiQuestion('殿下の象徴的なギターソロは？'), true);
assert.equal(isMusicRelatedAiQuestion('ボスってBorn in the U.S.A.の頃は何歳？'), true);
assert.equal(isMusicRelatedAiQuestion('Is the BOSS still touring?'), true);
assert.equal(isMusicRelatedAiQuestion('オジーの有名な曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('ハノイのギタリストは？'), true);
assert.equal(isMusicRelatedAiQuestion('モンちゃんの出身は？'), true);
assert.equal(isMusicRelatedAiQuestion('マイコーのスリラーは何年？'), true);
assert.equal(isMusicRelatedAiQuestion('Tayの最新アルバムどう？'), true);
assert.equal(isMusicRelatedAiQuestion('スローハンドのクラプトンって何の意味？'), true);
assert.equal(isMusicRelatedAiQuestion('Swiftiesって何者のファン？'), true);
assert.equal(isMusicRelatedAiQuestion('ARMYの応援文化を教えて'), true);
assert.equal(isMusicRelatedAiQuestion('BeyHiveってビヨンセのファン？'), true);
assert.equal(isMusicRelatedAiQuestion('1Dのデビュー曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('5SOSってオーストラリアのバンド？'), true);
assert.equal(isMusicRelatedAiQuestion('ラルクのベーシストは？'), true);
assert.equal(isMusicRelatedAiQuestion('twenty one pilotsのヒット曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('CCRの代表曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('聖子ちゃんのデビューはいつ？'), true);
assert.equal(isMusicRelatedAiQuestion('花の82年組って誰がいる？'), true);
assert.equal(isMusicRelatedAiQuestion('MSGのギタリストは誰？'), true);
assert.equal(isMusicRelatedAiQuestion('マーシャルとフェンダーアンプの違いは？'), true);
assert.equal(isMusicRelatedAiQuestion('テレキャスでジャズは合う？'), true);
assert.equal(isMusicRelatedAiQuestion('キューベースでオーディオインターフェースは？'), true);
assert.equal(isMusicRelatedAiQuestion('808のキックって何が特徴？'), true);
assert.equal(isMusicRelatedAiQuestion('ゴッパーとゴナナの違いは？'), true);
assert.equal(isMusicRelatedAiQuestion('MPC3000でサンプリングした曲ってある？'), true);
assert.equal(isMusicRelatedAiQuestion('トークボックスとヴォコーダーの違いは？'), true);
assert.equal(isMusicRelatedAiQuestion('Auto-Tuneかけすぎってどう思う？'), true);
assert.equal(isMusicRelatedAiQuestion('メロダインでタイミング直すの普通？'), true);
assert.equal(isMusicRelatedAiQuestion('ボカロのベタ打ちってどういう意味？'), true);
assert.equal(isMusicRelatedAiQuestion('歌ってみたのマイクおすすめは？'), true);
assert.equal(isMusicRelatedAiQuestion('プロセカのイベントって何？'), true);
assert.equal(isMusicRelatedAiQuestion('弐寺の皆伝ってどれくらい難しい？'), true);
assert.equal(isMusicRelatedAiQuestion('ガルパのイベント楽曲は？'), true);
assert.equal(isMusicRelatedAiQuestion('音ゲーの全良って何？'), true);
assert.equal(isMusicRelatedAiQuestion('ウッドストック1969の出演者で好きなのは？'), true);
assert.equal(isMusicRelatedAiQuestion('ライブエイドのクイーンは何演奏した？'), true);
assert.equal(isMusicRelatedAiQuestion('ラシュボの思い出ある？'), true);
assert.equal(isMusicRelatedAiQuestion('ロキソニの出演者いつ発表？'), true);

assert.equal(
  isMusicRelatedAiQuestion('Michael JacksonのBeat Itでギターを弾いているのは？'),
  true
);
assert.equal(isMusicRelatedAiQuestion('Who played the guitar solo on Beat It?'), true);

assert.equal(
  isMusicRelatedAiQuestion('Chaka KhanのI Feel for Youでハーモニカを吹いているのは？'),
  true
);
assert.equal(isMusicRelatedAiQuestion('この曲のコーラスは誰？'), true);
assert.equal(isMusicRelatedAiQuestion('Who produced I Feel for You?'), true);

console.log('is-music-related-ai-question unit tests: OK');
