import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearCommentPackPrepSnapshotsForTests,
  getCommentPackPrepSnapshot,
  setCommentPackPrepSnapshot,
  type CommentPackPrepSnapshot,
} from './comment-pack-prep-cache';
import { japaneseEconomyFromDomestic } from './resolve-japanese-economy';

function sampleSnap(partial?: Partial<CommentPackPrepSnapshot>): CommentPackPrepSnapshot {
  return {
    rawYouTubeTitle: 'Artist - Song',
    title: 'Artist - Song',
    authorName: 'Artist',
    artist: 'Artist',
    artistDisplay: 'Artist',
    song: 'Song',
    songId: 'sid',
    channelId: 'ch',
    channelTitle: 'Artist',
    description: null,
    publishedAt: null,
    viewCount: null,
    defaultAudioLanguage: null,
    categoryId: null,
    isJpDomestic: false,
    isJpEconomy: false,
    artistLabel: 'Artist',
    songLabel: 'Song',
    music8FactsBlockTrimmed: '',
    mbFactsBlockTrimmed: '',
    music8ModeratorHints: null,
    isSupergroupArtist: false,
    supergroupBlock: '',
    songIntroOnlyDiscography: false,
    isNewRelease: false,
    baseOnlyPack: false,
    musicaichatCover: false,
    knownCoverOriginalHint: '',
    hasMusic8SongBlob: false,
    ...partial,
  };
}

test('comment-pack prep snapshot round-trip', () => {
  clearCommentPackPrepSnapshotsForTests();
  setCommentPackPrepSnapshot('vid1', sampleSnap({ songLabel: 'Hello' }));
  const hit = getCommentPackPrepSnapshot('vid1');
  assert.ok(hit);
  assert.equal(hit.songLabel, 'Hello');
  assert.equal(getCommentPackPrepSnapshot('missing'), null);
  clearCommentPackPrepSnapshotsForTests();
});

test('japaneseEconomyFromDomestic respects COMMENT_PACK_JP_ECONOMY=0', () => {
  const prev = process.env.COMMENT_PACK_JP_ECONOMY;
  try {
    delete process.env.COMMENT_PACK_JP_ECONOMY;
    assert.equal(japaneseEconomyFromDomestic(true), true);
    assert.equal(japaneseEconomyFromDomestic(false), false);
    process.env.COMMENT_PACK_JP_ECONOMY = '0';
    assert.equal(japaneseEconomyFromDomestic(true), false);
  } finally {
    if (prev === undefined) delete process.env.COMMENT_PACK_JP_ECONOMY;
    else process.env.COMMENT_PACK_JP_ECONOMY = prev;
  }
});
