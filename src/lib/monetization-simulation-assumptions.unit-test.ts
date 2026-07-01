import assert from 'node:assert/strict';
import {
  MONETIZATION_R_BASELINE,
  MONETIZATION_SCENARIO_A_LEGACY_ROWS,
  buildMonetizationSimulationRows,
  monetizationBreakEvenPaidUu,
  monetizationMarginalProfitPerUserJpy,
  monetizationVariablePerUserMonthJpy,
  sumMonetizationSimulationRows,
} from './monetization-simulation-assumptions';

const r = MONETIZATION_R_BASELINE;

assert.equal(monetizationVariablePerUserMonthJpy(r), 228);
assert.equal(monetizationMarginalProfitPerUserJpy(1000, r), 736);

const legacy = buildMonetizationSimulationRows({
  growthRows: MONETIZATION_SCENARIO_A_LEGACY_ROWS,
  fixedMonthlyJpy: 45_000,
  monthlyPriceJpy: 1000,
  r,
});
assert.equal(legacy[0]?.monthlyProfit, -8200);
assert.equal(legacy[5]?.paidUu, 300);
assert.equal(sumMonetizationSimulationRows(legacy).monthlyProfit, 502_800);

assert.equal(monetizationBreakEvenPaidUu(45_000, 1000, r), 62);
assert.equal(monetizationBreakEvenPaidUu(12_100, 1000, r), 17);
assert.equal(monetizationBreakEvenPaidUu(7_500, 1000, r), 11);

console.log('monetization-simulation-assumptions.unit-test.ts: ok');
