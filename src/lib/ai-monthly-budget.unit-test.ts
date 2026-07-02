import assert from 'node:assert/strict';
import {
  getAiMonthlyBudgetStatusSync,
  isAiBudgetManualKillSwitchOn,
  isAiMonthlyVariableBudgetEnabled,
  isAiOperationsHaltedSync,
  jstMonthKey,
  jstMonthStartIso,
  resetAiMonthlyBudgetCacheForTests,
  resolveAiMonthlyVariableBudgetJpy,
} from './ai-monthly-budget';

const env = process.env;

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const keys = new Set([...Object.keys(env), ...Object.keys(overrides)]);
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = env[k];
  try {
    for (const k of keys) {
      if (overrides[k] === undefined) delete env[k];
      else env[k] = overrides[k];
    }
    fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
    resetAiMonthlyBudgetCacheForTests();
  }
}

assert.equal(jstMonthKey(Date.parse('2026-07-02T02:00:00.000Z')), '2026-07');
assert.equal(jstMonthKey(Date.parse('2026-06-30T16:00:00.000Z')), '2026-07');

const julyStart = jstMonthStartIso(Date.parse('2026-07-15T12:00:00.000Z'));
assert.ok(julyStart.startsWith('2026-06-30T15:00:00'));

withEnv(
  {
    AI_MONTHLY_VARIABLE_BUDGET_ENABLED: undefined,
    AI_MONTHLY_VARIABLE_BUDGET_DISABLED: undefined,
    AI_BUDGET_KILL_SWITCH: undefined,
  },
  () => {
    assert.equal(isAiMonthlyVariableBudgetEnabled(), false);
    assert.equal(isAiOperationsHaltedSync(), false);
  },
);

withEnv(
  {
    AI_MONTHLY_VARIABLE_BUDGET_ENABLED: '1',
    AI_MONTHLY_VARIABLE_BUDGET_JPY: '100000',
    AI_BUDGET_KILL_SWITCH: undefined,
  },
  () => {
    assert.equal(resolveAiMonthlyVariableBudgetJpy(), 100_000);
    assert.equal(isAiMonthlyVariableBudgetEnabled(), true);
    assert.equal(isAiOperationsHaltedSync(), false);
  },
);

withEnv(
  {
    AI_MONTHLY_VARIABLE_BUDGET_ENABLED: '1',
    AI_BUDGET_KILL_SWITCH: '1',
  },
  () => {
    assert.equal(isAiBudgetManualKillSwitchOn(), true);
    assert.equal(isAiOperationsHaltedSync(), true);
    assert.equal(getAiMonthlyBudgetStatusSync().reason, 'manual_kill_switch');
  },
);

withEnv(
  {
    AI_MONTHLY_VARIABLE_BUDGET_ENABLED: '1',
    AI_MONTHLY_VARIABLE_BUDGET_DISABLED: '1',
  },
  () => {
    assert.equal(isAiMonthlyVariableBudgetEnabled(), false);
    assert.equal(isAiOperationsHaltedSync(), false);
  },
);

console.log('ai-monthly-budget.unit-test.ts: ok');
