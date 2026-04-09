import assert from 'node:assert/strict';
import { mergeManualAndAutoTasteForPrompt } from './user-ai-taste-context';
import { USER_AI_TASTE_PROMPT_MAX_CHARS } from './user-ai-taste-summary';

assert.equal(mergeManualAndAutoTasteForPrompt(null, null), null);
assert.equal(mergeManualAndAutoTasteForPrompt('手動だけ', null), '手動だけ');
assert.equal(mergeManualAndAutoTasteForPrompt(null, '自動だけ'), '自動だけ');
const both = mergeManualAndAutoTasteForPrompt('手動', '自動');
assert.ok(both?.includes('手動'));
assert.ok(both?.includes('自動'));
assert.ok(both?.includes('自動要約'));
assert.ok(both != null && both.length <= USER_AI_TASTE_PROMPT_MAX_CHARS);

const longManual = 'あ'.repeat(2000);
const merged = mergeManualAndAutoTasteForPrompt(longManual, 'い'.repeat(600));
assert.ok(merged != null && merged.length <= USER_AI_TASTE_PROMPT_MAX_CHARS);

console.log('user-ai-taste-context unit tests: OK');
