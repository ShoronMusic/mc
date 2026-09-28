import assert from 'node:assert/strict';
import {
  collectCurrentSongCommentarySlots,
  isSongCommentaryChatMessage,
  songCommentaryPanelText,
  songCommentarySlotIndexFromBody,
} from './song-commentary-panel';

assert.equal(songCommentarySlotIndexFromBody('【AI曲解説01】本文'), 0);
assert.equal(songCommentarySlotIndexFromBody('【AI曲解説05】本文'), 4);
assert.equal(songCommentarySlotIndexFromBody('【AI解説03】旧ラベル'), 2);
assert.equal(songCommentarySlotIndexFromBody('【曲クイズ】三択'), null);
assert.equal(songCommentarySlotIndexFromBody('【AI曲解説06】範囲外'), null);

assert.equal(
  isSongCommentaryChatMessage({ messageType: 'ai', body: '【AI曲解説02】x' }),
  true,
);
assert.equal(
  isSongCommentaryChatMessage({ messageType: 'user', body: '【AI曲解説01】x' }),
  false,
);
assert.equal(songCommentaryPanelText('【AI曲解説01】[DB] キャッシュ本文'), 'キャッシュ本文');
assert.equal(songCommentaryPanelText('【AI曲解説01】[NEW] 新規本文'), '[NEW] 新規本文');

const slots = collectCurrentSongCommentarySlots(
  [
    { id: 'a', messageType: 'ai', videoId: 'v1', body: '【AI曲解説01】いち', aiSource: 'tidbit' },
    { id: 'b', messageType: 'ai', videoId: 'v1', body: '【AI曲解説01】いち改', aiSource: 'tidbit' },
    { id: 'c', messageType: 'ai', videoId: 'v2', body: '【AI曲解説02】別の曲', aiSource: 'tidbit' },
    { id: 'd', messageType: 'ai', videoId: 'v1', body: '【おすすめ曲01】おすすめ', aiSource: 'next_song_recommend' },
    { id: 'e', messageType: 'ai', videoId: 'v1', body: '【AI曲解説04】よん', tidbitId: 'tb', songId: 's1' },
  ],
  'v1',
);
assert.equal(slots[0]?.text, 'いち改');
assert.equal(slots[0]?.messageId, 'b');
assert.equal(slots[1], null);
assert.equal(slots[3]?.text, 'よん');
assert.equal(slots[3]?.tidbitId, 'tb');
assert.equal(slots[3]?.songId, 's1');

console.log('song-commentary-panel.unit-test: ok');
