import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcGeminiCostUsd, GEMINI_PRICING_PER_1M_USD } from '@/lib/gemini-pricing';
import { readGeminiUsageTokenCounts } from '@/lib/gemini-usage-log';

test('gemini-3.5-flash-lite shares 2.5 Flash $/1M band', () => {
  const a = GEMINI_PRICING_PER_1M_USD['gemini-2.5-flash'];
  const b = GEMINI_PRICING_PER_1M_USD['gemini-3.5-flash-lite'];
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.input, b.input);
  assert.equal(a.output, b.output);
});

test('gemini-2.5-flash-lite is the paid copyedit rate (not Gemma)', () => {
  const lite = GEMINI_PRICING_PER_1M_USD['gemini-2.5-flash-lite'];
  assert.ok(lite);
  assert.equal(lite.input, 0.1);
  assert.equal(lite.output, 0.4);
  assert.equal(calcGeminiCostUsd(1_000_000, 0, 'gemini-2.5-flash-lite'), 0.1);
  assert.equal(calcGeminiCostUsd(0, 1_000_000, 'gemini-2.5-flash-lite'), 0.4);
  assert.equal(calcGeminiCostUsd(1_000_000, 0, 'models/gemini-2.5-flash-lite'), 0.1);
  assert.equal(calcGeminiCostUsd(1_000_000, 1_000_000, 'gemma-4-31b-it'), 0);
});

test('gemini-3.5-flash-lite cost equals 2.5 Flash for same tokens', () => {
  const prompt = 100_000;
  const output = 10_000;
  assert.equal(
    calcGeminiCostUsd(prompt, output, 'gemini-3.5-flash-lite'),
    calcGeminiCostUsd(prompt, output, 'gemini-2.5-flash'),
  );
});

test('readGeminiUsageTokenCounts: outputTokenCount fallback', () => {
  const a = readGeminiUsageTokenCounts({ promptTokenCount: 10, candidatesTokenCount: 3 });
  assert.equal(a.promptTokenCount, 10);
  assert.equal(a.outputTokenCount, 3);
  const b = readGeminiUsageTokenCounts({ promptTokenCount: 8, outputTokenCount: 2 });
  assert.equal(b.promptTokenCount, 8);
  assert.equal(b.outputTokenCount, 2);
});
