import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSongIntroOnlyBaseComment,
  shouldUseSongIntroOnlyDiscographyMode,
} from '@/lib/commentary-song-intro-only-mode';

test('intro-only: no Music8 song and empty facts → true', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({ musicaichatSong: null, combinedFactsText: '' }),
    true,
  );
});

test('intro-only: Music8 releases year but facts lack album/single wording → false (full commentary)', () => {
  const song = {
    stable_key: { artist_slug: 'a', song_slug: 'b' },
    releases: { original_release_date: '1979-01-01' },
    facts_for_ai: { bullets: ['ジャンル： New wave'] },
  };
  const block =
    '【Music8 参照事実（外部マスタ。本文はこれと矛盾させない。推測で補わない）】\n・ジャンル： New wave\n・stable_key: a_b';
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({ musicaichatSong: song, combinedFactsText: block }),
    false,
  );
});

test('intro-only: facts with year in text but no provenance → true', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({
      musicaichatSong: null,
      combinedFactsText: '・1979年頃に話題となった',
    }),
    true,
  );
});

test('intro-only: facts with year + シングル → false', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({
      musicaichatSong: null,
      combinedFactsText: '・1979年のシングルとしてリリース',
    }),
    false,
  );
});

test('buildSongIntroOnlyBaseComment: starts with artist の『song』', () => {
  const t = buildSongIntroOnlyBaseComment('Vapour Trails', "Don't Worry Baby");
  assert.match(t, /^Vapour Trailsの『Don't Worry Baby』/);
  assert.ok(t.length >= 80);
});
