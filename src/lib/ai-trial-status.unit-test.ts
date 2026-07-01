import assert from 'node:assert/strict';
import {
  buildPreviewAiTrialStatus,
  formatAiTrialStatusPrimaryLine,
  formatAiTrialStatusSecondaryLine,
} from '@/lib/ai-trial-status';

const preview = buildPreviewAiTrialStatus();
assert.match(formatAiTrialStatusPrimaryLine(preview), /残 10\/10 曲/);
assert.match(formatAiTrialStatusPrimaryLine(preview), /@質問 残 5\/5/);
assert.match(formatAiTrialStatusSecondaryLine(preview)!, /試験運用/);

console.log('ai-trial-status.unit-test: ok');
