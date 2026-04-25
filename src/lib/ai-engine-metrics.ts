import type { Phase1ObservedMetrics } from '@/lib/ai-engine-phases';

export type ChatLogLiteRow = {
  room_id: string | null;
  message_type: string | null;
  display_name: string | null;
  created_at: string | null;
};

export type FeedbackLiteRow = {
  source: string | null;
  is_upvote: boolean | null;
};

export type GeminiUsageLiteRow = {
  prompt_token_count: number | null;
  output_token_count: number | null;
  room_id: string | null;
};

export type TokenPricingJpyPer1k = {
  prompt: number;
  output: number;
};

const DEFAULT_TOKEN_PRICING_JPY_PER_1K: TokenPricingJpyPer1k = {
  prompt: 0.12,
  output: 0.48,
};

function toMillis(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isAiMessage(row: ChatLogLiteRow): boolean {
  if ((row.message_type ?? '').toLowerCase() === 'ai') return true;
  return (row.display_name ?? '').trim() === 'AI';
}

function isUserMessage(row: ChatLogLiteRow): boolean {
  return (row.message_type ?? '').toLowerCase() === 'user';
}

/**
 * 会話継続率（簡易）:
 * AI発言のあと continuationWindowSec 以内に user 発言があれば「継続」とみなす。
 */
export function computeConversationContinuationRate(
  rows: ChatLogLiteRow[],
  continuationWindowSec: number = 180,
): number {
  const byRoom = new Map<string, Array<{ at: number; type: 'ai' | 'user' | 'other' }>>();

  for (const row of rows) {
    const roomId = (row.room_id ?? '').trim();
    const at = toMillis(row.created_at);
    if (!roomId || at == null) continue;
    const type: 'ai' | 'user' | 'other' = isAiMessage(row)
      ? 'ai'
      : isUserMessage(row)
        ? 'user'
        : 'other';
    const list = byRoom.get(roomId) ?? [];
    list.push({ at, type });
    byRoom.set(roomId, list);
  }

  let aiCount = 0;
  let continuedCount = 0;
  const windowMs = Math.max(1, continuationWindowSec) * 1000;

  for (const events of byRoom.values()) {
    events.sort((a, b) => a.at - b.at);
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type !== 'ai') continue;
      aiCount += 1;
      const aiAt = events[i].at;
      let continued = false;
      for (let j = i + 1; j < events.length; j += 1) {
        const next = events[j];
        if (next.at - aiAt > windowMs) break;
        if (next.type === 'user') {
          continued = true;
          break;
        }
      }
      if (continued) continuedCount += 1;
    }
  }

  if (aiCount === 0) return 0;
  return continuedCount / aiCount;
}

/**
 * 選曲提案採用率（簡易代理指標）:
 * next_song_recommend に対する upvote / (upvote + downvote)。
 */
export function computeSuggestionAdoptionRate(feedbackRows: FeedbackLiteRow[]): number {
  let good = 0;
  let bad = 0;
  for (const row of feedbackRows) {
    if ((row.source ?? '').trim() !== 'next_song_recommend') continue;
    if (row.is_upvote === true) good += 1;
    if (row.is_upvote === false) bad += 1;
  }
  const total = good + bad;
  if (total === 0) return 0;
  return good / total;
}

/**
 * ネガティブ評価率:
 * is_upvote が入っている全件を対象に downvote 比率を算出。
 */
export function computeNegativeFeedbackRate(feedbackRows: FeedbackLiteRow[]): number {
  let total = 0;
  let bad = 0;
  for (const row of feedbackRows) {
    if (typeof row.is_upvote !== 'boolean') continue;
    total += 1;
    if (row.is_upvote === false) bad += 1;
  }
  if (total === 0) return 0;
  return bad / total;
}

export function estimateGeminiCostJpy(
  usageRows: GeminiUsageLiteRow[],
  pricing: TokenPricingJpyPer1k = DEFAULT_TOKEN_PRICING_JPY_PER_1K,
): number {
  let prompt = 0;
  let output = 0;
  for (const row of usageRows) {
    prompt += row.prompt_token_count ?? 0;
    output += row.output_token_count ?? 0;
  }
  return (prompt / 1000) * pricing.prompt + (output / 1000) * pricing.output;
}

export function countActiveRooms(usageRows: GeminiUsageLiteRow[], fallbackChatRows: ChatLogLiteRow[]): number {
  const set = new Set<string>();
  for (const row of usageRows) {
    const roomId = (row.room_id ?? '').trim();
    if (roomId) set.add(roomId);
  }
  if (set.size > 0) return set.size;
  for (const row of fallbackChatRows) {
    const roomId = (row.room_id ?? '').trim();
    if (roomId) set.add(roomId);
  }
  return set.size;
}

export function buildPhase1ObservedMetrics(
  chatRows: ChatLogLiteRow[],
  feedbackRows: FeedbackLiteRow[],
  usageRows: GeminiUsageLiteRow[],
): Phase1ObservedMetrics {
  const continuation = computeConversationContinuationRate(chatRows);
  const adoption = computeSuggestionAdoptionRate(feedbackRows);
  const negative = computeNegativeFeedbackRate(feedbackRows);
  const costTotal = estimateGeminiCostJpy(usageRows);
  const rooms = countActiveRooms(usageRows, chatRows);
  const perRoom = rooms > 0 ? costTotal / rooms : costTotal;

  return {
    conversationContinuationRate: continuation,
    suggestionAdoptionRate: adoption,
    negativeFeedbackRate: negative,
    costPerActiveRoomJpy: perRoom,
  };
}

/**
 * 人格再現スコア（簡易）:
 * chat_reply への upvote 比率を基準にし、投票が無い場合は 0.5 を返す。
 */
export function computeExternalModelPersonaFitScore(feedbackRows: FeedbackLiteRow[]): number {
  let good = 0;
  let bad = 0;
  for (const row of feedbackRows) {
    if ((row.source ?? '').trim() !== 'chat_reply') continue;
    if (row.is_upvote === true) good += 1;
    if (row.is_upvote === false) bad += 1;
  }
  const total = good + bad;
  if (total === 0) return 0.5;
  return good / total;
}

/**
 * 月次コスト（期間集計版）。
 * usageRows をそのまま渡し、対象期間の概算コストを返す。
 */
export function estimatePeriodInferenceCostJpy(
  usageRows: GeminiUsageLiteRow[],
  pricing: TokenPricingJpyPer1k = DEFAULT_TOKEN_PRICING_JPY_PER_1K,
): number {
  return estimateGeminiCostJpy(usageRows, pricing);
}
