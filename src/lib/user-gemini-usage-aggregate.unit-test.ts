import {
  aggregateUserGeminiUsage,
  isRoomCommonBillingKind,
  logBelongsToUserBilling,
  type UserGeminiUsageLogRow,
} from './user-gemini-usage-aggregate';

const userId = 'user-me';

const participation = [
  {
    id: '1',
    room_id: '02',
    gathering_id: null,
    gathering_title: 'テスト',
    display_name: 'Tester',
    joined_at: '2026-06-29T09:00:00+09:00',
    left_at: '2026-06-29T11:00:00+09:00',
  },
];

const logs: UserGeminiUsageLogRow[] = [
  {
    context: 'chat_reply',
    model: 'gemini-2.5-flash',
    prompt_token_count: 100,
    output_token_count: 50,
    room_id: '02',
    created_at: '2026-06-29T10:00:00+09:00',
    billing_kind: 'participant_user',
    billing_user_id: userId,
    user_id: userId,
  },
  {
    context: 'tidbit',
    model: 'gemini-2.5-flash',
    prompt_token_count: 80,
    output_token_count: 40,
    room_id: '02',
    created_at: '2026-06-29T10:30:00+09:00',
    billing_kind: 'room_owner',
    billing_user_id: userId,
    user_id: null,
  },
  {
    context: 'chat_reply',
    model: 'gemini-2.5-flash',
    prompt_token_count: 20,
    output_token_count: 10,
    room_id: '02',
    created_at: '2026-06-29T10:45:00+09:00',
    billing_kind: 'participant_user',
    billing_user_id: 'other-user',
    user_id: userId,
  },
];

const agg = aggregateUserGeminiUsage(participation, logs, userId);

const ok =
  logBelongsToUserBilling(logs[0], userId) &&
  !logBelongsToUserBilling(logs[2], userId) &&
  isRoomCommonBillingKind('room_owner') &&
  !isRoomCommonBillingKind('participant_user') &&
  agg.totals.calls === 2 &&
  agg.personal.totals.calls === 1 &&
  agg.roomCommon.totals.calls === 1 &&
  agg.logsWithUserId === 2;

if (!ok) {
  console.error('user-gemini-usage-aggregate unit tests: FAILED', {
    totals: agg.totals.calls,
    personal: agg.personal.totals.calls,
    roomCommon: agg.roomCommon.totals.calls,
  });
  process.exit(1);
}
console.log('user-gemini-usage-aggregate unit tests: OK');
