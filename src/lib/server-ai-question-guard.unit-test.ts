/**
 * `npx tsx src/lib/server-ai-question-guard.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { isAiQuestionGuardServerFailOpen } from './server-ai-question-guard';

const orig = process.env.AI_QUESTION_GUARD_SERVER_FAIL_OPEN;
delete process.env.AI_QUESTION_GUARD_SERVER_FAIL_OPEN;
assert.equal(isAiQuestionGuardServerFailOpen(), false);
process.env.AI_QUESTION_GUARD_SERVER_FAIL_OPEN = '1';
assert.equal(isAiQuestionGuardServerFailOpen(), true);
process.env.AI_QUESTION_GUARD_SERVER_FAIL_OPEN = orig;
console.log('server-ai-question-guard unit tests: OK');
