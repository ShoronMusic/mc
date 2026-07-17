/** プリペイドクレジット（段階1〜2）。正本: docs/00-prepaid-pricing-summary.md */

export const AI_CREDIT_PACK_500_JPY = 500;
export const AI_CREDIT_PACK_500_CREDITS = 20;

export const AI_CREDIT_PACK_1000_JPY = 1000;
export const AI_CREDIT_PACK_1000_CREDITS = 40;

/** AI付き選曲 1曲 = 1 クレジット / @ 質問 1回 = 0.5 クレジット（正本: docs/00-prepaid-pricing-summary.md） */
export const AI_CREDIT_COST_PER_SONG = 1;
export const AI_CREDIT_COST_PER_AT_QUESTION = 0.5;

/** 残高・消費を 0.1 刻みに正規化（numeric 小数のぶれ防止） */
export function normalizeAiCreditAmount(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/** 表示用（整数なら小数点なし、0.5 などは 1 桁） */
export function formatAiCreditAmount(value: number): string {
  const n = normalizeAiCreditAmount(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** `AI_CREDITS_ENABLED=1` のとき trial 枯渇後にクレジット判定・消費 */
export function isAiCreditsEnabled(): boolean {
  return process.env.AI_CREDITS_ENABLED === '1';
}
