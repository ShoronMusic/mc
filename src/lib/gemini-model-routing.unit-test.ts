import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesGeminiSecondaryRoutingToken,
  remapRetiredGeminiModelId,
  resolveCharacterSongPickModelId,
  resolveGenerationModelId,
  resolveSanitizeModelId,
} from '@/lib/gemini-model-routing';

test('matchesGeminiSecondaryRoutingToken: all and star', () => {
  assert.equal(matchesGeminiSecondaryRoutingToken('chat_reply', 'all'), true);
  assert.equal(matchesGeminiSecondaryRoutingToken('anything', '*'), true);
});

test('matchesGeminiSecondaryRoutingToken: exact', () => {
  assert.equal(matchesGeminiSecondaryRoutingToken('chat_reply', 'chat_reply'), true);
  assert.equal(matchesGeminiSecondaryRoutingToken('chat_reply', 'tidbit'), false);
});

test('matchesGeminiSecondaryRoutingToken: prefix token_', () => {
  assert.equal(matchesGeminiSecondaryRoutingToken('comment_pack_base', 'comment_pack'), true);
  assert.equal(matchesGeminiSecondaryRoutingToken('comment_pack_free_1', 'comment_pack'), true);
  assert.equal(matchesGeminiSecondaryRoutingToken('comment_pack_session_bridge', 'comment_pack'), true);
  assert.equal(matchesGeminiSecondaryRoutingToken('commentary', 'comment_pack'), false);
});

test('remapRetiredGeminiModelId: 2.5 Flash-Lite to 3.5 Flash-Lite', () => {
  assert.equal(remapRetiredGeminiModelId('gemini-2.5-flash-lite'), 'gemini-3.5-flash-lite');
  assert.equal(remapRetiredGeminiModelId('models/gemini-2.5-flash-lite'), 'gemini-3.5-flash-lite');
  assert.equal(remapRetiredGeminiModelId('gemini-2.5-flash'), 'gemini-2.5-flash');
});

test('resolveSanitizeModelId: GEMINI_SANITIZE_MODEL 2.5-flash-lite is remapped', () => {
  const prev = process.env.GEMINI_SANITIZE_MODEL;
  process.env.GEMINI_SANITIZE_MODEL = 'gemini-2.5-flash-lite';
  try {
    assert.equal(resolveSanitizeModelId(), 'gemini-3.5-flash-lite');
  } finally {
    if (prev === undefined) delete process.env.GEMINI_SANITIZE_MODEL;
    else process.env.GEMINI_SANITIZE_MODEL = prev;
  }
});

test('character_song_pick: Gemma primary uses Flash unless USE_PRIMARY', () => {
  const prevPrimary = process.env.GEMINI_GENERATION_MODEL;
  const prevSecondary = process.env.GEMINI_MODEL_SECONDARY;
  const prevUse = process.env.GEMINI_USE_SECONDARY_FOR;
  const prevPick = process.env.GEMINI_CHARACTER_SONG_PICK_MODEL;
  const prevUsePrimary = process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY;
  process.env.GEMINI_GENERATION_MODEL = 'gemma-4-31b-it';
  delete process.env.GEMINI_MODEL_SECONDARY;
  delete process.env.GEMINI_USE_SECONDARY_FOR;
  delete process.env.GEMINI_CHARACTER_SONG_PICK_MODEL;
  delete process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY;
  try {
    assert.equal(resolveGenerationModelId('character_song_pick'), 'gemini-2.5-flash');
    assert.equal(resolveGenerationModelId('next_song_recommend'), 'gemini-2.5-flash');
    assert.equal(resolveGenerationModelId('song_quiz'), 'gemini-2.5-flash');
    assert.equal(resolveGenerationModelId('chat_reply'), 'gemini-2.5-flash');
    assert.equal(resolveCharacterSongPickModelId(), 'gemini-2.5-flash');
    assert.equal(resolveGenerationModelId('commentary'), 'gemma-4-31b-it');
    process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY = '1';
    assert.equal(resolveGenerationModelId('character_song_pick'), 'gemma-4-31b-it');
    delete process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY;
    process.env.GEMINI_SONG_QUIZ_USE_PRIMARY = '1';
    assert.equal(resolveGenerationModelId('song_quiz'), 'gemma-4-31b-it');
    delete process.env.GEMINI_SONG_QUIZ_USE_PRIMARY;
    process.env.GEMINI_CHAT_REPLY_USE_PRIMARY = '1';
    assert.equal(resolveGenerationModelId('chat_reply'), 'gemma-4-31b-it');
    delete process.env.GEMINI_CHAT_REPLY_USE_PRIMARY;
    process.env.GEMINI_CHARACTER_SONG_PICK_MODEL = 'gemini-3.5-flash';
    assert.equal(resolveGenerationModelId('character_song_pick'), 'gemini-3.5-flash');
  } finally {
    if (prevPrimary === undefined) delete process.env.GEMINI_GENERATION_MODEL;
    else process.env.GEMINI_GENERATION_MODEL = prevPrimary;
    if (prevSecondary === undefined) delete process.env.GEMINI_MODEL_SECONDARY;
    else process.env.GEMINI_MODEL_SECONDARY = prevSecondary;
    if (prevUse === undefined) delete process.env.GEMINI_USE_SECONDARY_FOR;
    else process.env.GEMINI_USE_SECONDARY_FOR = prevUse;
    if (prevPick === undefined) delete process.env.GEMINI_CHARACTER_SONG_PICK_MODEL;
    else process.env.GEMINI_CHARACTER_SONG_PICK_MODEL = prevPick;
    if (prevUsePrimary === undefined) delete process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY;
    else process.env.GEMINI_CHARACTER_SONG_PICK_USE_PRIMARY = prevUsePrimary;
    delete process.env.GEMINI_SONG_QUIZ_USE_PRIMARY;
    delete process.env.GEMINI_CHAT_REPLY_USE_PRIMARY;
  }
});

