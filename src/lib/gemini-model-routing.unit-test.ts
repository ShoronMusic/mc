import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesGeminiSecondaryRoutingToken,
  remapRetiredGeminiModelId,
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
