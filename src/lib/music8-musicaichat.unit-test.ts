import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMusicaichatFactsForAiPromptBlock,
  shouldRegenerateLibraryWhenMusicaichatSong,
  skipMusic8FactInjectEnv,
} from '@/lib/music8-musicaichat';
import { extractMusic8SongFields, isMusicaichatFactsBoilerplateLine } from '@/lib/music8-song-fields';

test('buildMusicaichatFactsForAiPromptBlock: constraints as string', () => {
  const block = buildMusicaichatFactsForAiPromptBlock({
    stable_key: { artist_slug: 'a', song_slug: 'b' },
    facts_for_ai: {
      opening_lines: ['導入1'],
      bullets: ['箇条1'],
      constraints_for_model: 'チャート順位は書かない',
    },
  });
  assert.match(block, /導入1/);
  assert.match(block, /箇条1/);
  assert.match(block, /チャート順位は書かない/);
  assert.match(block, /stable_key: a_b/);
});

test('buildMusicaichatFactsForAiPromptBlock: constraints as array', () => {
  const block = buildMusicaichatFactsForAiPromptBlock({
    stable_key: { artist_slug: 'x', song_slug: 'y' },
    facts_for_ai: {
      constraints_for_model: ['ルールA', 'ルールB'],
    },
  });
  assert.match(block, /ルールA/);
  assert.match(block, /ルールB/);
});

test('buildMusicaichatFactsForAiPromptBlock: empty facts', () => {
  const block = buildMusicaichatFactsForAiPromptBlock({
    stable_key: { artist_slug: 'a', song_slug: 'b' },
  });
  assert.equal(block, '');
});

test('Music8 listing boilerplate is stripped from facts block and song extract', () => {
  const boilerplate1 = 'Oasis の「Cigarettes & Alcohol」は Music8 に掲載されている楽曲です。';
  const boilerplate2 = '楽曲は Britpop、Glam rock などの文脈で分類されています。';
  assert.equal(isMusicaichatFactsBoilerplateLine(boilerplate1), true);
  assert.equal(isMusicaichatFactsBoilerplateLine(boilerplate2), true);
  assert.equal(isMusicaichatFactsBoilerplateLine('ジャンル： Britpop'), false);

  const block = buildMusicaichatFactsForAiPromptBlock({
    stable_key: { artist_slug: 'oasis', song_slug: 'cigarettes-alcohol' },
    facts_for_ai: {
      opening_lines: [boilerplate1, boilerplate2],
      bullets: ['ジャンル： Britpop'],
    },
  });
  assert.doesNotMatch(block, /Music8 に掲載/);
  assert.doesNotMatch(block, /文脈で分類されています/);
  assert.match(block, /ジャンル： Britpop/);

  const ex = extractMusic8SongFields({
    stable_key: { artist_slug: 'oasis', song_slug: 'cigarettes-alcohol' },
    facts_for_ai: {
      opening_lines: [boilerplate1, boilerplate2],
      bullets: ['ボーカル： Liam Gallagher'],
    },
    classification: ['Britpop'],
    releases: { original_release_date: '1994-08-29' },
    styles: [2845],
  });
  assert.doesNotMatch(ex.description, /Music8 に掲載/);
  assert.match(ex.description, /ボーカル/);
});

test('shouldRegenerateLibraryWhenMusicaichatSong: default on when song JSON and inject on', () => {
  const song = { stable_key: { artist_slug: 'a', song_slug: 'b' } };
  const prev = process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8;
  const prevInject = process.env.COMMENT_PACK_INJECT_MUSIC8_FACTS;
  try {
    delete process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8;
    delete process.env.COMMENT_PACK_INJECT_MUSIC8_FACTS;
    assert.equal(skipMusic8FactInjectEnv(), false);
    assert.equal(shouldRegenerateLibraryWhenMusicaichatSong(song, false), true);
    process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8 = '0';
    assert.equal(shouldRegenerateLibraryWhenMusicaichatSong(song, false), false);
    delete process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8;
    assert.equal(shouldRegenerateLibraryWhenMusicaichatSong(song, true), false);
    assert.equal(shouldRegenerateLibraryWhenMusicaichatSong(null, false), false);
  } finally {
    if (prev === undefined) delete process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8;
    else process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8 = prev;
    if (prevInject === undefined) delete process.env.COMMENT_PACK_INJECT_MUSIC8_FACTS;
    else process.env.COMMENT_PACK_INJECT_MUSIC8_FACTS = prevInject;
  }
});
