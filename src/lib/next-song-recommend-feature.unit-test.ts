import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextSongRecommendBetaUserIds,
  isNextSongRecommendAllowedForUser,
  isNextSongRecommendMasterEnabled,
} from '@/lib/next-song-recommend-feature';
import { parseSeedLabelToArtistTitle } from '@/lib/next-song-recommend-store';

test('isNextSongRecommendMasterEnabled: 1 のときのみ true', () => {
  const prev = process.env.NEXT_SONG_RECOMMEND_ENABLED;
  process.env.NEXT_SONG_RECOMMEND_ENABLED = '1';
  assert.equal(isNextSongRecommendMasterEnabled(), true);
  process.env.NEXT_SONG_RECOMMEND_ENABLED = '0';
  assert.equal(isNextSongRecommendMasterEnabled(), false);
  delete process.env.NEXT_SONG_RECOMMEND_ENABLED;
  assert.equal(isNextSongRecommendMasterEnabled(), false);
  if (prev === undefined) delete process.env.NEXT_SONG_RECOMMEND_ENABLED;
  else process.env.NEXT_SONG_RECOMMEND_ENABLED = prev;
});

test('β UID リストが空ならログイン uid で allowed', () => {
  const prevE = process.env.NEXT_SONG_RECOMMEND_ENABLED;
  const prevB = process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  process.env.NEXT_SONG_RECOMMEND_ENABLED = '1';
  delete process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  assert.equal(isNextSongRecommendAllowedForUser('any-uuid'), true);
  assert.equal(isNextSongRecommendAllowedForUser(null), false);
  process.env.NEXT_SONG_RECOMMEND_ENABLED = '0';
  assert.equal(isNextSongRecommendAllowedForUser('any-uuid'), false);
  if (prevE === undefined) delete process.env.NEXT_SONG_RECOMMEND_ENABLED;
  else process.env.NEXT_SONG_RECOMMEND_ENABLED = prevE;
  if (prevB === undefined) delete process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  else process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS = prevB;
});

test('β UID リストが非空なら一致のみ allowed', () => {
  const prevE = process.env.NEXT_SONG_RECOMMEND_ENABLED;
  const prevB = process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  process.env.NEXT_SONG_RECOMMEND_ENABLED = '1';
  process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS = 'a, b';
  assert.equal(isNextSongRecommendAllowedForUser('a'), true);
  assert.equal(isNextSongRecommendAllowedForUser('b'), true);
  assert.equal(isNextSongRecommendAllowedForUser('c'), false);
  if (prevE === undefined) delete process.env.NEXT_SONG_RECOMMEND_ENABLED;
  else process.env.NEXT_SONG_RECOMMEND_ENABLED = prevE;
  if (prevB === undefined) delete process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  else process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS = prevB;
});

test('getNextSongRecommendBetaUserIds がカンマ区切りを正規化', () => {
  const prev = process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS = ' x , y ';
  assert.deepEqual(getNextSongRecommendBetaUserIds(), ['x', 'y']);
  if (prev === undefined) delete process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS;
  else process.env.NEXT_SONG_RECOMMEND_BETA_USER_IDS = prev;
});

test('parseSeedLabelToArtistTitle: em dash（種曲ラベル）', () => {
  assert.deepEqual(parseSeedLabelToArtistTitle('Olivia Rodrigo — drivers license'), {
    artist: 'Olivia Rodrigo',
    title: 'drivers license',
  });
});

test('parseSeedLabelToArtistTitle: ASCII ハイフン', () => {
  assert.deepEqual(parseSeedLabelToArtistTitle('Billie Eilish - Happier Than Ever'), {
    artist: 'Billie Eilish',
    title: 'Happier Than Ever',
  });
});

test('parseSeedLabelToArtistTitle: 空・解析不能は null', () => {
  assert.equal(parseSeedLabelToArtistTitle(''), null);
  assert.equal(parseSeedLabelToArtistTitle('   '), null);
  assert.equal(parseSeedLabelToArtistTitle('no separator here'), null);
});
