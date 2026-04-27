import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSongIntroOnlyArtistFocusComment,
  buildSongIntroOnlyBaseComment,
  shouldUseSongIntroOnlyDiscographyMode,
} from '@/lib/commentary-song-intro-only-mode';

test('intro-only: no Music8 song and empty facts → false (fallback to normal commentary)', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({ music8Song: null, combinedFactsText: '' }),
    false,
  );
});

test('intro-only: Music8 releases year but facts lack album/single wording → true', () => {
  const song = {
    stable_key: { artist_slug: 'a', song_slug: 'b' },
    releases: { original_release_date: '1979-01-01' },
    facts_for_ai: { bullets: ['ジャンル： New wave'] },
  };
  const block =
    '【Music8 参照事実（外部マスタ。本文はこれと矛盾させない。推測で補わない）】\n・ジャンル： New wave\n・stable_key: a_b';
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({ music8Song: song, combinedFactsText: block }),
    true,
  );
});

test('intro-only: facts with year in text but no provenance → true', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({
      music8Song: null,
      combinedFactsText: '・1979年頃に話題となった',
    }),
    true,
  );
});

test('intro-only: facts with year + シングル → false', () => {
  assert.equal(
    shouldUseSongIntroOnlyDiscographyMode({
      music8Song: null,
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

test('buildSongIntroOnlyArtistFocusComment: includes release period when available', () => {
  const song = {
    stable_key: { artist_slug: 'stevie-wonder', song_slug: 'keep-on-running' },
    releases: { original_release_date: '1972-03-01' },
    classification: ['Soul'],
  };
  const t = buildSongIntroOnlyArtistFocusComment({
    artistLabel: 'Stevie Wonder',
    songLabel: 'Keep On Running',
    music8Song: song,
  });
  assert.match(t, /詳しいリリース時期や収録アルバムは不明です/);
  assert.match(t, /1972年頃/);
  assert.doesNotMatch(t, /1972\.03/);
  assert.match(t, /Stevie Wonder/);
  assert.doesNotMatch(t, /Soul|R&B|Jazz|Rock/);
});
