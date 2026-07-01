/**
 * Gemini Developer API の概算料金（管理画面・マイページ共通）
 */

export const GEMINI_PRICING_URL = 'https://ai.google.dev/pricing';

/** 100万トークンあたり USD（公式料金ページ準拠） */
export const GEMINI_PRICING_PER_1M_USD: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-3.1-pro-preview': { input: 2.0, output: 12 },
};

/** 目安表示用の固定レート（課金試算ツールと同じ） */
export const GEMINI_USD_TO_JPY_APPROX = 160;

export type GeminiUsageTokenSummary = {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
  costJpyApprox: number;
};

export function emptyGeminiUsageSummary(): GeminiUsageTokenSummary {
  return {
    calls: 0,
    promptTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    costJpyApprox: 0,
  };
}

export function calcGeminiCostUsd(
  promptTokens: number,
  outputTokens: number,
  model: string,
): number {
  const p = GEMINI_PRICING_PER_1M_USD[model];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

export function calcGeminiCostJpyApprox(usd: number): number {
  return usd * GEMINI_USD_TO_JPY_APPROX;
}

export function addGeminiLogToSummary(
  summary: GeminiUsageTokenSummary,
  log: {
    prompt_token_count?: number | null;
    output_token_count?: number | null;
    model?: string | null;
  },
): void {
  const p = log.prompt_token_count ?? 0;
  const o = log.output_token_count ?? 0;
  const model = (log.model || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
  summary.calls += 1;
  summary.promptTokens += p;
  summary.outputTokens += o;
  const usd = calcGeminiCostUsd(p, o, model);
  summary.costUsd += usd;
  summary.costJpyApprox += calcGeminiCostJpyApprox(usd);
}

export function mergeGeminiUsageSummaries(
  a: GeminiUsageTokenSummary,
  b: GeminiUsageTokenSummary,
): GeminiUsageTokenSummary {
  return {
    calls: a.calls + b.calls,
    promptTokens: a.promptTokens + b.promptTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
    costJpyApprox: a.costJpyApprox + b.costJpyApprox,
  };
}

/** JST の YYYY-MM（月次集計用） */
export function geminiUsageMonthKeyJst(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'unknown';
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatGeminiUsageMonthLabelJa(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  return `${m[1]}年${Number(m[2])}月`;
}

export function formatGeminiCostJpyApprox(jpy: number): string {
  if (jpy < 1) return `約 ¥${jpy.toFixed(1)}`;
  return `約 ¥${Math.round(jpy)}`;
}
