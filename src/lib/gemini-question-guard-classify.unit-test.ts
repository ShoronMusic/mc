import assert from 'node:assert/strict';
import { parseQuestionGuardModelJson } from './gemini-question-guard-classify';

assert.equal(parseQuestionGuardModelJson('{"musicRelated":true}'), true);
assert.equal(parseQuestionGuardModelJson('{"musicRelated":false}'), false);
assert.equal(parseQuestionGuardModelJson('説明\n{"musicRelated": true}'), true);
assert.equal(parseQuestionGuardModelJson('invalid'), null);

console.log('gemini-question-guard-classify unit tests: OK');
