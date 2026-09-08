/**
 * `npx tsx src/lib/library-song-commentary-text.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  pickLibrarySongCommentaryText,
  usableLibraryMusic8Intro,
} from '@/lib/library-song-commentary-text';

const dbIntro =
  'ノルウェー出身のシンガーソングライターAURORAが2016年3月、デビューアルバム『All My Demons Greeting Me As A Friend』から放った。闇を友として迎える歌詞は孤独と再生を描き、透き通るボーカルと電子音が交錯するアートポップ。';

assert.equal(usableLibraryMusic8Intro('短い'), null);
assert.equal(usableLibraryMusic8Intro('AURORA - All My Demons Greeting Me As A Friend'), null);
assert.ok(usableLibraryMusic8Intro(dbIntro));

assert.equal(
  pickLibrarySongCommentaryText({
    dbMusic8Intro: dbIntro,
    music8JsonDescription: 'GCS の古い抜粋。'.repeat(20),
    aiCommentary: '部屋チャット用のAI解説です。',
  }),
  dbIntro,
);

assert.equal(
  pickLibrarySongCommentaryText({
    dbMusic8Intro: '',
    music8JsonDescription: dbIntro,
    aiCommentary: 'AI',
  }),
  dbIntro,
);

assert.equal(
  pickLibrarySongCommentaryText({
    dbMusic8Intro: null,
    music8JsonDescription: 'AURORA - Title',
    aiCommentary: '保存済みAI解説本文です。',
  }),
  '保存済みAI解説本文です。',
);

assert.equal(
  pickLibrarySongCommentaryText({
    dbMusic8Intro: null,
    music8JsonDescription: null,
    aiCommentary: null,
  }),
  null,
);

console.log('library-song-commentary-text.unit-test: ok');
