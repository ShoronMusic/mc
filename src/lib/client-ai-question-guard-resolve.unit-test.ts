import assert from 'node:assert/strict';
import { resolveQuestionGuardClassifyApiOutcome } from './client-ai-question-guard-resolve';

assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(200, { skipped: false, musicRelated: true }),
  { outcome: 'allow' },
);
assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(200, { skipped: false, musicRelated: false }),
  { outcome: 'block' },
);
assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(200, { skipped: true, musicRelated: null }),
  { outcome: 'allow' },
);
assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(200, { skipped: false, musicRelated: null }),
  { outcome: 'allow' },
);
assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(503, null),
  { outcome: 'allow' },
);
assert.deepEqual(
  resolveQuestionGuardClassifyApiOutcome(429, { error: 'rate_limit', message: 'busy' }),
  { outcome: 'allow' },
);

console.log('client-ai-question-guard-resolve unit tests: OK');
