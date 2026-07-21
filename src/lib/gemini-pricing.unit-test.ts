import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcGeminiCostUsd, GEMINI_PRICING_PER_1M_USD } from '@/lib/gemini-pricing';

test('gemini-3.5-flash-lite shares 2.5 Flash $/1M band', () => {
  const a = GEMINI_PRICING_PER_1M_USD['gemini-2.5-flash'];
  const b = GEMINI_PRICING_PER_1M_USD['gemini-3.5-flash-lite'];
  assert.ok(a);
  assert.ok(b);
  assert.equal(a.input, b.input);
  assert.equal(a.output, b.output);
});

test('gemini-3.5-flash-lite cost equals 2.5 Flash for same tokens', () => {
  const prompt = 100_000;
  const output = 10_000;
  assert.equal(
    calcGeminiCostUsd(prompt, output, 'gemini-3.5-flash-lite'),
    calcGeminiCostUsd(prompt, output, 'gemini-2.5-flash'),
  );
});
