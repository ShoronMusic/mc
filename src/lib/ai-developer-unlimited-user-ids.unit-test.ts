import assert from 'node:assert/strict';
import {
  getDeveloperAiUnlimitedUserIds,
  isDeveloperAiUnlimitedUserId,
} from '@/lib/ai-developer-unlimited-user-ids';

const prev = process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;

delete process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
assert.deepEqual(getDeveloperAiUnlimitedUserIds(), []);
assert.equal(isDeveloperAiUnlimitedUserId('d100d24d-9a70-447e-84ac-e519ada7af8c'), false);

process.env.AI_DEVELOPER_UNLIMITED_USER_IDS =
  'd100d24d-9a70-447e-84ac-e519ada7af8c, 25bcbb9c-ffab-4f24-b6ca-28d85fe59111';
assert.deepEqual(getDeveloperAiUnlimitedUserIds(), [
  'd100d24d-9a70-447e-84ac-e519ada7af8c',
  '25bcbb9c-ffab-4f24-b6ca-28d85fe59111',
]);
assert.equal(isDeveloperAiUnlimitedUserId('d100d24d-9a70-447e-84ac-e519ada7af8c'), true);
assert.equal(isDeveloperAiUnlimitedUserId('unknown'), false);

if (prev === undefined) delete process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
else process.env.AI_DEVELOPER_UNLIMITED_USER_IDS = prev;

console.log('ai-developer-unlimited-user-ids.unit-test: ok');
