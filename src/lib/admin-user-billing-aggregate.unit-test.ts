import {
  resolveLogBillingUserId,
  resolveLogTriggerUserId,
  type GeminiBillingLogRow,
} from './admin-user-billing-aggregate';

const participantLog: GeminiBillingLogRow = {
  room_id: '02',
  context: 'chat_reply',
  model: 'gemini-2.5-flash',
  prompt_token_count: 100,
  output_token_count: 50,
  billing_kind: 'participant_user',
  billing_user_id: 'user-a',
  user_id: 'user-a',
  trigger_user_id: 'user-a',
  created_at: '2026-06-29T10:00:00+09:00',
};

const guestOwnerLog: GeminiBillingLogRow = {
  ...participantLog,
  context: 'commentary',
  billing_kind: 'guest_enjoy_owner_paid',
  billing_user_id: 'owner-1',
  user_id: null,
  trigger_user_id: null,
};

const legacyLog: GeminiBillingLogRow = {
  room_id: '02',
  context: 'commentary',
  model: null,
  prompt_token_count: 10,
  output_token_count: 5,
  billing_kind: null,
  billing_user_id: null,
  user_id: 'legacy-user',
  trigger_user_id: null,
  created_at: '2026-06-29T10:00:00+09:00',
};

const ok =
  resolveLogBillingUserId(participantLog) === 'user-a' &&
  resolveLogTriggerUserId(participantLog) === 'user-a' &&
  resolveLogBillingUserId(guestOwnerLog) === 'owner-1' &&
  resolveLogTriggerUserId(guestOwnerLog) === null &&
  resolveLogBillingUserId(legacyLog) === 'legacy-user';

if (!ok) {
  console.error('admin-user-billing-aggregate unit tests: FAILED');
  process.exit(1);
}
console.log('admin-user-billing-aggregate unit tests: OK');
