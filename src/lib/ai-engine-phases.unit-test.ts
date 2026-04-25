import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE1_DEFAULT_GATES,
  PHASE1_MVP_SPEC,
  evaluateCustomLlmReadiness,
  evaluatePhase1GoNoGo,
} from '@/lib/ai-engine-phases';

test('PHASE1_MVP_SPEC: URL直生成は禁止', () => {
  assert.equal(PHASE1_MVP_SPEC.allowDirectUrlGeneration, false);
  assert.equal(PHASE1_MVP_SPEC.urlSelectionPolicy, 'search_result_only');
});

test('evaluatePhase1GoNoGo: すべて閾値内なら pass', () => {
  const result = evaluatePhase1GoNoGo({
    conversationContinuationRate: PHASE1_DEFAULT_GATES.minConversationContinuationRate,
    suggestionAdoptionRate: PHASE1_DEFAULT_GATES.minSuggestionAdoptionRate,
    negativeFeedbackRate: PHASE1_DEFAULT_GATES.maxNegativeFeedbackRate,
    costPerActiveRoomJpy: PHASE1_DEFAULT_GATES.maxCostPerActiveRoomJpy,
  });
  assert.equal(result.passed, true);
  assert.equal(result.failedReasons.length, 0);
});

test('evaluatePhase1GoNoGo: 閾値違反を複数検出', () => {
  const result = evaluatePhase1GoNoGo({
    conversationContinuationRate: 0.4,
    suggestionAdoptionRate: 0.1,
    negativeFeedbackRate: 0.35,
    costPerActiveRoomJpy: 70,
  });
  assert.equal(result.passed, false);
  assert.equal(result.failedReasons.length, 4);
});

test('evaluateCustomLlmReadiness: トリガーあり + 運用準備完了で開始', () => {
  const result = evaluateCustomLlmReadiness({
    monthlyInferenceCostJpy: 300000,
    externalModelPersonaFitScore: 0.8,
    dataGovernanceReady: true,
    evalPipelineReady: true,
    failoverReady: true,
  });
  assert.equal(result.shouldStartPhase3, true);
});

test('evaluateCustomLlmReadiness: トリガーありでも運用未準備なら開始しない', () => {
  const result = evaluateCustomLlmReadiness({
    monthlyInferenceCostJpy: 300000,
    externalModelPersonaFitScore: 0.6,
    dataGovernanceReady: false,
    evalPipelineReady: false,
    failoverReady: false,
  });
  assert.equal(result.shouldStartPhase3, false);
  assert.equal(result.reasons.length >= 4, true);
});
