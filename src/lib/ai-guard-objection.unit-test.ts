import assert from 'node:assert/strict';
import { isValidAiGuardObjectionReasonIds } from '@/lib/ai-guard-objection';

assert.equal(isValidAiGuardObjectionReasonIds(null), false);
assert.equal(isValidAiGuardObjectionReasonIds([]), false);
assert.equal(isValidAiGuardObjectionReasonIds(['music_related']), true);
assert.equal(isValidAiGuardObjectionReasonIds(['music_related', 'contextual']), true);
assert.equal(isValidAiGuardObjectionReasonIds(['invalid']), false);
assert.equal(isValidAiGuardObjectionReasonIds(['music_related', 'music_related']), false);

console.log('ai-guard-objection.unit-test: ok');
