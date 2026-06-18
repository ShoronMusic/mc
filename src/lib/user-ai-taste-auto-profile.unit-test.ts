import assert from 'node:assert/strict';
import {
  isSubstantiveUserTasteAutoProfile,
  looksTruncatedUserTasteAutoProfile,
  userTasteAutoProfileForUse,
} from './user-ai-taste-auto-profile';

const weakIntro = '洋楽チャット利用者の聴取趣向・関心の傾向は以下の通りです。';
assert.equal(isSubstantiveUserTasteAutoProfile(weakIntro), false);
assert.equal(userTasteAutoProfileForUse(weakIntro), null);

const truncated =
  '- 80年代のニューウェーブ、ポップ、ハードロックから、90年代の';
assert.equal(looksTruncatedUserTasteAutoProfile(truncated), true);
assert.equal(isSubstantiveUserTasteAutoProfile(truncated), false);

const goodBullets = '・80年代洋楽が好き\n・Sting / Prince をよく聴く';
assert.equal(isSubstantiveUserTasteAutoProfile(goodBullets), true);
assert.ok(userTasteAutoProfileForUse(goodBullets)?.includes('Sting'));

console.log('user-ai-taste-auto-profile unit tests: OK');
