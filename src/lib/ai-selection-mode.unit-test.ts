import assert from 'node:assert/strict';
import { resolveAiSelectionMode, shouldShowAiDualSelectionButtons } from '@/lib/ai-selection-mode';
import type { AiTrialStatus } from '@/lib/ai-trial-status';

const trialActive: AiTrialStatus = {
  phase: 'trial_active',
  songsGranted: 10,
  songsRemaining: 10,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 5,
  enforcementEnabled: true,
};

const preview: AiTrialStatus = {
  phase: 'preview',
  songsGranted: 10,
  songsRemaining: 10,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 5,
  enforcementEnabled: false,
};

const exhausted: AiTrialStatus = {
  phase: 'trial_exhausted',
  songsGranted: 10,
  songsRemaining: 0,
  atQuestionsGranted: 5,
  atQuestionsRemaining: 0,
  enforcementEnabled: true,
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

console.log('ai-selection-mode.unit-test: ok');
