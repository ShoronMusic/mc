import assert from 'node:assert/strict';
import {
  buildDeveloperUnlimitedAiTrialStatus,
  buildPreviewAiTrialStatus,
  formatAiTrialStatusPrimaryLine,
  formatAiTrialStatusSecondaryLine,
  isAiDeveloperUnlimitedTrialStatus,
} from '@/lib/ai-trial-status';

const preview = buildPreviewAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(preview), /残 10\/10 曲/);
assert.match(formatAiTrialStatusPrimaryLine(preview), /@質問 残 5\/5/);
assert.match(formatAiTrialStatusSecondaryLine(preview)!, /試験運用/);

const devUnlimited = buildDeveloperUnlimitedAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(devUnlimited), /開発者/);
assert.equal(isAiDeveloperUnlimitedTrialStatus(devUnlimited), true);
assert.equal(isAiDeveloperUnlimitedTrialStatus(preview), false);

console.log('ai-trial-status.unit-test: ok');
