import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhase1ObservedMetrics,
  computeConversationContinuationRate,
  computeExternalModelPersonaFitScore,
  computeNegativeFeedbackRate,
  computeSuggestionAdoptionRate,
  estimatePeriodInferenceCostJpy,
  estimateGeminiCostJpy,
} from '@/lib/ai-engine-metrics';

test('computeConversationContinuationRate: AI後にuser発言があれば継続', () => {
  const rate = computeConversationContinuationRate([
    {
      room_id: 'r1',
      message_type: 'ai',
      display_name: 'AI',
      created_at: '2026-04-24T10:00:00.000Z',
    },
    {
      room_id: 'r1',
      message_type: 'user',
      display_name: 'u1',
      created_at: '2026-04-24T10:01:00.000Z',
    },
    {
      room_id: 'r1',
      message_type: 'ai',
      display_name: 'AI',
      created_at: '2026-04-24T10:10:00.000Z',
    },
  ]);
  assert.equal(rate, 0.5);
});

test('computeSuggestionAdoptionRate: next_song_recommend のupvote比率', () => {
  const rate = computeSuggestionAdoptionRate([
    { source: 'next_song_recommend', is_upvote: true },
    { source: 'next_song_recommend', is_upvote: false },
    { source: 'commentary', is_upvote: true },
  ]);
  assert.equal(rate, 0.5);
});

test('computeNegativeFeedbackRate: 全投票のdownvote比率', () => {
  const rate = computeNegativeFeedbackRate([
    { source: 'commentary', is_upvote: true },
    { source: 'next_song_recommend', is_upvote: false },
    { source: 'tidbit', is_upvote: false },
  ]);
  assert.equal(rate, 2 / 3);
});

test('estimateGeminiCostJpy: token 単価で概算', () => {
  const cost = estimateGeminiCostJpy(
    [
      { prompt_token_count: 1000, output_token_count: 1000, room_id: 'r1' },
      { prompt_token_count: 500, output_token_count: 0, room_id: 'r1' },
    ],
    { prompt: 1, output: 2 },
  );
  assert.equal(cost, 3.5);
});

test('buildPhase1ObservedMetrics: 統合算出', () => {
  const observed = buildPhase1ObservedMetrics(
    [
      {
        room_id: 'r1',
        message_type: 'ai',
        display_name: 'AI',
        created_at: '2026-04-24T10:00:00.000Z',
      },
      {
        room_id: 'r1',
        message_type: 'user',
        display_name: 'u1',
        created_at: '2026-04-24T10:00:30.000Z',
      },
    ],
    [{ source: 'next_song_recommend', is_upvote: true }],
    [{ prompt_token_count: 1000, output_token_count: 1000, room_id: 'r1' }],
  );

  assert.equal(observed.conversationContinuationRate, 1);
  assert.equal(observed.suggestionAdoptionRate, 1);
  assert.equal(observed.negativeFeedbackRate, 0);
  assert.equal(observed.costPerActiveRoomJpy > 0, true);
});

test('computeExternalModelPersonaFitScore: chat_reply の評価比率', () => {
  const score = computeExternalModelPersonaFitScore([
    { source: 'chat_reply', is_upvote: true },
    { source: 'chat_reply', is_upvote: true },
    { source: 'chat_reply', is_upvote: false },
    { source: 'commentary', is_upvote: false },
  ]);
  assert.equal(score, 2 / 3);
});

test('estimatePeriodInferenceCostJpy: 期間コスト算出', () => {
  const cost = estimatePeriodInferenceCostJpy(
    [{ prompt_token_count: 2000, output_token_count: 1000, room_id: 'r1' }],
    { prompt: 1, output: 2 },
  );
  assert.equal(cost, 4);
});
