/**
 * `npx tsx src/lib/chat-ai-rate-limit.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { checkChatAiRateLimit } from './chat-ai-rate-limit';

const orig = process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE;
const origGuest = process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE_GUEST;
process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE = '3';
process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE_GUEST = '2';

const g = globalThis as unknown as { __chatAiRateTimestamps?: Map<string, number[]> };
g.__chatAiRateTimestamps = new Map();

assert.equal(checkChatAiRateLimit('1.1.1.1').ok, true);
assert.equal(checkChatAiRateLimit('1.1.1.1').ok, true);
assert.equal(checkChatAiRateLimit('1.1.1.1').ok, true);
const fourth = checkChatAiRateLimit('1.1.1.1');
assert.equal(fourth.ok, false);
if (fourth.ok) throw new Error('expected rate limit');
assert.ok(fourth.retryAfterSec >= 1);

assert.equal(checkChatAiRateLimit('2.2.2.2').ok, true);
assert.equal(checkChatAiRateLimit('3.3.3.3', true).ok, true);
assert.equal(checkChatAiRateLimit('3.3.3.3', true).ok, true);
assert.equal(checkChatAiRateLimit('3.3.3.3', true).ok, false);

process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE = orig;
process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE_GUEST = origGuest;
console.log('chat-ai-rate-limit unit tests: OK');
