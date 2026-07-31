import assert from 'node:assert/strict';
import { resolveAiSelectionMode, shouldShowAiDualSelectionButtons } from '@/lib/ai-selection-mode';
import type { AiTrialStatus } from '@/lib/ai-trial-status';

const trialActive: AiTrialStatus = {
  phase: 'trial_active',
  songsGranted: 20,
  songsRemaining: 10,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 5,
  enforcementEnabled: true,
  creditsEnabled: false,
  creditsRemaining: 0,
};

const preview: AiTrialStatus = {
  phase: 'preview',
  songsGranted: 20,
  songsRemaining: 10,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 5,
  enforcementEnabled: false,
  creditsEnabled: false,
  creditsRemaining: 0,
};

const exhausted: AiTrialStatus = {
  phase: 'trial_exhausted',
  songsGranted: 20,
  songsRemaining: 0,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 0,
  enforcementEnabled: true,
  creditsEnabled: false,
  creditsRemaining: 0,
};

const creditsActive: AiTrialStatus = {
  phase: 'credits_active',
  songsGranted: 20,
  songsRemaining: 0,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 0,
  enforcementEnabled: true,
  creditsEnabled: true,
  creditsRemaining: 40,
};

const developerUnlimited: AiTrialStatus = {
  phase: 'developer_unlimited',
  songsGranted: 20,
  songsRemaining: 10,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 5,
  enforcementEnabled: true,
  creditsEnabled: false,
  creditsRemaining: 0,
};

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: trialActive,
  }),
  'full',
  'trial active: default submit is AI full',
);

assert.equal(
  resolveAiSelectionMode({
    explicitMode: 'none',
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: trialActive,
  }),
  'none',
  'trial active: explicit none is honored',
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: null,
  }),
  'full',
  'registered user before trial API: optimistic full',
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: preview,
  }),
  'full',
  'preview phase: full without consuming',
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: exhausted,
  }),
  'none',
  'exhausted: no AI',
);

const trialEligible: AiTrialStatus = {
  ...trialActive,
  phase: 'trial_eligible',
  songsRemaining: 20,
};
assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: trialEligible,
  }),
  'full',
  'eligible (not yet granted): full',
);
assert.equal(
  shouldShowAiDualSelectionButtons({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: trialEligible,
  }),
  true,
  'eligible: dual buttons',
);

const ipLimited: AiTrialStatus = {
  ...exhausted,
  phase: 'trial_ip_limited',
};
assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: ipLimited,
  }),
  'none',
  'ip limited: no AI',
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: developerUnlimited,
  }),
  'full',
  'developer unlimited: full AI',
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: true,
    participatesInSelection: true,
    aiTrialStatus: trialActive,
  }),
  'none',
  'guest: always none',
);

assert.equal(
  shouldShowAiDualSelectionButtons({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: trialActive,
  }),
  true,
);

assert.equal(
  resolveAiSelectionMode({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: creditsActive,
  }),
  'full',
  'credits active: full AI',
);

assert.equal(
  shouldShowAiDualSelectionButtons({
    isGuest: false,
    participatesInSelection: true,
    aiTrialStatus: creditsActive,
  }),
  true,
  'credits active: dual buttons',
);

console.log('ai-selection-mode.unit-test: ok');
