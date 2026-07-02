/** プリペイドクレジット（段階1〜2）。正本: docs/00-prepaid-pricing-summary.md */

export const AI_CREDIT_PACK_500_JPY = 500;
export const AI_CREDIT_PACK_500_CREDITS = 20;

export const AI_CREDIT_PACK_1000_JPY = 1000;
export const AI_CREDIT_PACK_1000_CREDITS = 40;

/** 1 AI付き選曲 / @ 1回 = 1 クレジット（v1） */
export const AI_CREDIT_COST_PER_SONG = 1;
export const AI_CREDIT_COST_PER_AT_QUESTION = 1;

/** `AI_CREDITS_ENABLED=1` のとき trial 枯渇後にクレジット判定・消費 */
export function isAiCreditsEnabled(): boolean {
  return process.env.AI_CREDITS_ENABLED === '1';
}
