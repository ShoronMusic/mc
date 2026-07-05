import assert from 'node:assert/strict';
import {
  getSupporterAiUnlimitedUserIds,
  isSupporterAiUnlimitedUserId,
} from '@/lib/ai-supporter-unlimited-user-ids';

const prev = process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;

delete process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;
assert.deepEqual(getSupporterAiUnlimitedUserIds(), []);
assert.equal(isSupporterAiUnlimitedUserId('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), false);

process.env.AI_SUPPORTER_UNLIMITED_USER_IDS =
  '1e9c88e3-715a-4485-8b1e-b418e1d61d88, 25bcbb9c-ffab-4f24-b6ca-28d85fe59111';
assert.deepEqual(getSupporterAiUnlimitedUserIds(), [
  '1e9c88e3-715a-4485-8b1e-b418e1d61d88',
  '25bcbb9c-ffab-4f24-b6ca-28d85fe59111',
]);
assert.equal(isSupporterAiUnlimitedUserId('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), true);
assert.equal(isSupporterAiUnlimitedUserId('unknown'), false);

if (prev === undefined) delete process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;
else process.env.AI_SUPPORTER_UNLIMITED_USER_IDS = prev;

console.log('ai-supporter-unlimited-user-ids.unit-test: ok');
