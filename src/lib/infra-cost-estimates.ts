/**
 * YouTube Data API クォータ・Ably メッセージの概算原価（管理画面・部屋原価サマリー）
 *
 * YouTube: 公式クォータ（search.list=100, videos.list=1）× 単価目安。
 * 単価は monetization-options.md の「0.15円/曲」に合わせ search 1 回 ≈ 100 単位 ≈ ¥0.15。
 * Ably: room_chat_log 件数をメッセージ推定（会スナップショットと同じ 1:1）。
 */

import type { YoutubeApiSlotStats } from '@/lib/youtube-api-slot-aggregate';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';

/** YouTube Data API v3 のクォータ単位（1 日 10,000 無料枠） */
export const YOUTUBE_API_QUOTA_SEARCH = 100;
export const YOUTUBE_API_QUOTA_VIDEOS = 1;
export const YOUTUBE_API_QUOTA_OTHER = 1;

/** 1 クォータ単位あたりの円目安（100 単位 = ¥0.15 → search.list 1 回 ≈ ¥0.15） */
export const YOUTUBE_JPY_PER_QUOTA_UNIT = 0.0015;

/** Ably Standard 従量の目安（$2.50 / 100 万メッセージ × USD160） */
export const ABLY_JPY_PER_MESSAGE_ESTIMATE = 0.0004;

export type YoutubeApiCostSummary = YoutubeApiSlotStats & {
  quotaUnits: number;
  costJpyApprox: number;
};

export type AblyCostEstimate = {
  messagesEstimated: number;
  costJpyApprox: number;
};

export function computeYoutubeApiQuotaUnits(stats: YoutubeApiSlotStats): number {
  const otherCalls = Math.max(0, stats.calls - stats.searchCalls - stats.videosCalls);
  return (
    stats.searchCalls * YOUTUBE_API_QUOTA_SEARCH +
    stats.videosCalls * YOUTUBE_API_QUOTA_VIDEOS +
    otherCalls * YOUTUBE_API_QUOTA_OTHER
  );
}

export function computeYoutubeApiCostJpyApprox(quotaUnits: number): number {
  return quotaUnits * YOUTUBE_JPY_PER_QUOTA_UNIT;
}

export function enrichYoutubeApiStats(stats: YoutubeApiSlotStats): YoutubeApiCostSummary {
  const quotaUnits = computeYoutubeApiQuotaUnits(stats);
  return {
    ...stats,
    quotaUnits,
    costJpyApprox: computeYoutubeApiCostJpyApprox(quotaUnits),
  };
}

export function estimateAblyCost(chatUserMessages: number, chatAiMessages: number): AblyCostEstimate {
  const messagesEstimated = Math.max(0, chatUserMessages) + Math.max(0, chatAiMessages);
  return {
    messagesEstimated,
    costJpyApprox: messagesEstimated * ABLY_JPY_PER_MESSAGE_ESTIMATE,
  };
}

export function formatInfraCostJpyApprox(jpy: number): string {
  return formatGeminiCostJpyApprox(jpy);
}
