import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesGeminiSecondaryRoutingToken } from '@/lib/gemini-model-routing';

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
