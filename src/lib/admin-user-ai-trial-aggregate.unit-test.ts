import { classifyAdminTrialRowPhase } from './admin-user-ai-trial-aggregate';
import {
  getAiTrialAdminMonitoringExcludedUserIds,
  isAiTrialAdminMonitoringExcludedUserId,
} from './ai-trial-admin-excluded-user-ids';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error('admin-user-ai-trial-aggregate unit tests: FAILED', message);
    process.exit(1);
  }
}

const savedStyleAdmin = process.env.STYLE_ADMIN_USER_IDS;
const savedDevUnlimited = process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
process.env.STYLE_ADMIN_USER_IDS = 'admin-uuid-1,admin-uuid-2';
process.env.AI_DEVELOPER_UNLIMITED_USER_IDS = 'dev-uuid-1';

try {
  assert(classifyAdminTrialRowPhase({ songs_remaining: 5, at_questions_remaining: 3 }) === 'active', 'active');
  assert(classifyAdminTrialRowPhase({ songs_remaining: 0, at_questions_remaining: 0 }) === 'exhausted', 'exhausted');
  assert(classifyAdminTrialRowPhase({ songs_remaining: 2, at_questions_remaining: 0 }) === 'songs_only', 'songs_only');
  assert(classifyAdminTrialRowPhase({ songs_remaining: 0, at_questions_remaining: 1 }) === 'at_only', 'at_only');

  assert(isAiTrialAdminMonitoringExcludedUserId('admin-uuid-1'), 'style admin excluded');
  assert(isAiTrialAdminMonitoringExcludedUserId('dev-uuid-1'), 'dev unlimited excluded');
  assert(!isAiTrialAdminMonitoringExcludedUserId('regular-user-uuid'), 'regular user included');
  assert(getAiTrialAdminMonitoringExcludedUserIds().length === 3, 'excluded id count');
} finally {
  if (savedStyleAdmin === undefined) delete process.env.STYLE_ADMIN_USER_IDS;
  else process.env.STYLE_ADMIN_USER_IDS = savedStyleAdmin;
  if (savedDevUnlimited === undefined) delete process.env.AI_DEVELOPER_UNLIMITED_USER_IDS;
  else process.env.AI_DEVELOPER_UNLIMITED_USER_IDS = savedDevUnlimited;
}

console.log('admin-user-ai-trial-aggregate unit tests: OK');
