import {
  AI_USAGE_FEE_UNASSIGNED_OWNER_ID,
  buildAiUsageFeeBreakdown,
  classifyAiUsageFeeCategory,
  classifyAiUsageFeePayer,
  geminiUsageDayKeyJst,
  type AiUsageFeeLogRow,
} from './admin-ai-usage-fee-breakdown';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const base: AiUsageFeeLogRow = {
  context: 'commentary',
  model: 'gemini-2.5-flash',
  prompt_token_count: 1_000_000,
  output_token_count: 0,
  billing_kind: 'participant_user',
  billing_user_id: 'user-a',
  user_id: 'user-a',
  trigger_user_id: 'user-a',
  created_at: '2026-04-27T15:00:00.000Z',
};

assert(geminiUsageDayKeyJst('2026-04-27T15:00:00.000Z') === '2026-04-28', 'jst day boundary');
assert(classifyAiUsageFeeCategory('comment_pack_free_2') === 'commentary', 'pack -> commentary');
assert(classifyAiUsageFeeCategory('commentary_copyedit') === 'commentary', 'copyedit -> commentary');
assert(classifyAiUsageFeeCategory('song_quiz') === 'quiz', 'quiz');
assert(classifyAiUsageFeeCategory('next_song_recommend') === 'recommend', 'recommend');
assert(classifyAiUsageFeeCategory('character_chat') === 'agent_speech', 'agent speech');
assert(classifyAiUsageFeeCategory('character_song_pick') === 'agent_pick', 'agent pick');
assert(classifyAiUsageFeeCategory('chat_reply') === 'at_question', 'at');
assert(classifyAiUsageFeeCategory('tidbit') === 'other', 'tidbit other');
assert(classifyAiUsageFeePayer(base) === 'user', 'participant is user');
assert(
  classifyAiUsageFeePayer({ ...base, billing_kind: 'ai_agent', billing_user_id: 'owner-1' }) ===
    'organizer',
  'agent is organizer',
);
assert(
  classifyAiUsageFeePayer({
    ...base,
    billing_kind: null,
    billing_user_id: null,
    user_id: 'legacy',
    trigger_user_id: null,
  }) === 'user',
  'legacy with user id is user',
);

const built = buildAiUsageFeeBreakdown(
  [
    base,
    {
      ...base,
      context: 'character_chat',
      billing_kind: 'ai_agent',
      billing_user_id: 'owner-1',
      user_id: 'owner-1',
      trigger_user_id: 'owner-1',
      prompt_token_count: 0,
      output_token_count: 0,
      created_at: '2026-04-28T01:00:00.000Z',
    },
    {
      ...base,
      context: 'song_quiz',
      created_at: '2026-05-01T00:00:00.000Z',
    },
  ],
  Date.parse('2026-04-28T03:00:00.000Z'),
);

assert(built.summary.total.user.byCategory.commentary.calls === 1, 'user commentary calls');
assert(built.summary.total.user.byCategory.quiz.calls === 1, 'user quiz calls');
assert(built.summary.total.organizer.byCategory.agent_speech.calls === 1, 'organizer speech');
assert(built.summary.total.user.total.calls === 2, 'user total calls');
assert(built.summary.today.key === '2026-04-28', 'today key');
assert(built.summary.today.user.byCategory.commentary.calls === 1, 'today includes jst midnight');
assert(built.summary.today.organizer.byCategory.agent_speech.calls === 1, 'today agent speech');
assert(built.summary.month.key === '2026-04', 'month key');
assert(built.summary.month.user.byCategory.quiz.calls === 0, 'may quiz is outside april');
assert(built.days[0]?.key === '2026-05-01', 'days newest first');
assert(built.users[0]?.userId === 'user-a', 'user row');
assert(built.organizers[0]?.userId === 'owner-1', 'organizer row');
assert(
  built.organizers.every((r) => r.userId !== AI_USAGE_FEE_UNASSIGNED_OWNER_ID || r.total.calls > 0),
  'unassigned only when used',
);
assert(built.summary.total.user.byCategory.commentary.costJpyApprox > 40, 'flash input yen');

console.log('admin-ai-usage-fee-breakdown unit tests: OK');
