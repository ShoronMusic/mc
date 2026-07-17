/**
 * `npx tsx src/lib/ai-cost-rate-limit.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { checkAiCostRateLimit, resetAiCostRateLimitStoreForTests } from './ai-cost-rate-limit';

const orig = process.env.AI_COST_RL_CHARACTER_CHAT_IP;
process.env.AI_COST_RL_CHARACTER_CHAT_IP = '2';
process.env.AI_COST_RL_CHARACTER_CHAT_USER = '2';
process.env.AI_COST_RL_CHARACTER_CHAT_GUEST = '1';

resetAiCostRateLimitStoreForTests();

assert.equal(checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '1.1.1.1' }).ok, true);
assert.equal(checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '1.1.1.1' }).ok, true);
const third = checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '1.1.1.1' });
assert.equal(third.ok, false);

resetAiCostRateLimitStoreForTests();
assert.equal(
  checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '2.2.2.2', userId: 'u1' }).ok,
  true,
);
assert.equal(
  checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '2.2.2.2', userId: 'u1' }).ok,
  true,
);
assert.equal(
  checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '2.2.2.2', userId: 'u1' }).ok,
  false,
);

resetAiCostRateLimitStoreForTests();
assert.equal(
  checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '3.3.3.3', isGuest: true }).ok,
  true,
);
assert.equal(
  checkAiCostRateLimit({ bucket: 'character_chat', clientIp: '3.3.3.3', isGuest: true }).ok,
  false,
);

process.env.AI_COST_RL_CHARACTER_CHAT_IP = orig;
console.log('ai-cost-rate-limit unit tests: OK');
