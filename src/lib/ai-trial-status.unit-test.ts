import assert from 'node:assert/strict';
import {
  buildDeveloperUnlimitedAiTrialStatus,
  buildPreviewAiTrialStatus,
  buildSupporterUnlimitedAiTrialStatus,
  formatAiTrialStatusHeaderLabel,
  formatAiTrialStatusPrimaryLine,
  formatAiTrialStatusSecondaryLine,
  isAiDeveloperUnlimitedTrialStatus,
  isAiSupporterUnlimitedTrialStatus,
  isAiUnlimitedTrialStatus,
} from '@/lib/ai-trial-status';

const preview = buildPreviewAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(preview), /残 20\/20 曲/);
assert.match(formatAiTrialStatusPrimaryLine(preview), /@質問 残 5\/5/);
assert.match(formatAiTrialStatusSecondaryLine(preview)!, /試験運用/);

const devUnlimited = buildDeveloperUnlimitedAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(devUnlimited), /開発者/);
assert.equal(formatAiTrialStatusHeaderLabel(devUnlimited), 'AI制限なし（開発者）');
assert.equal(isAiDeveloperUnlimitedTrialStatus(devUnlimited), true);
assert.equal(isAiUnlimitedTrialStatus(devUnlimited), true);
assert.equal(isAiDeveloperUnlimitedTrialStatus(preview), false);

const supporterUnlimited = buildSupporterUnlimitedAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(supporterUnlimited), /サポータアカウント/);
assert.equal(formatAiTrialStatusHeaderLabel(supporterUnlimited), 'AI制限なし（サポーター）');
assert.equal(isAiSupporterUnlimitedTrialStatus(supporterUnlimited), true);
assert.equal(isAiUnlimitedTrialStatus(supporterUnlimited), true);
assert.equal(isAiSupporterUnlimitedTrialStatus(preview), false);

console.log('ai-trial-status.unit-test: ok');
