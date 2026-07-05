import assert from 'node:assert/strict';
import { resolveAiUnlimitedRole, isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';

const prevDev = process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
const prevSup = process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;

delete process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
delete process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;
assert.equal(resolveAiUnlimitedRole('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), null);

process.env.AI_SUPPORTER_UNLIMITED_USER_IDS = '1e9c88e3-715a-4485-8b1e-b418e1d61d88';
assert.equal(resolveAiUnlimitedRole('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), 'supporter');
assert.equal(isAiUnlimitedUserId('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), true);

process.env.AI_DEVELOPER_UNLIMITED_USER_IDS = '1e9c88e3-715a-4485-8b1e-b418e1d61d88';
assert.equal(resolveAiUnlimitedRole('1e9c88e3-715a-4485-8b1e-b418e1d61d88'), 'developer');

if (prevDev === undefined) delete process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
else process.env.AI_DEVELOPER_UNLIMITED_USER_IDS = prevDev;
if (prevSup === undefined) delete process.env.AI_SUPPORTER_UNLIMITED_USER_IDS;
else process.env.AI_SUPPORTER_UNLIMITED_USER_IDS = prevSup;

console.log('ai-unlimited-user-ids.unit-test: ok');
