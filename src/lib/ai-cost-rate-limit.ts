/**
 * Gemini コスト経路向けの IP / ユーザー単位レート制限。
 */

import {
  checkSlidingWindowRateLimit,
  parseRateLimitEnv,
  type SlidingWindowRateLimitResult,
} from '@/lib/sliding-window-rate-limit';

export type AiCostRateLimitResult = SlidingWindowRateLimitResult;

type Bucket =
  | 'character_chat'
  | 'resolve_song_request'
  | 'comment_pack'
  | 'commentary'
  | 'song_quiz'
  | 'feedback'
  | 'announce_song'
  | 'room_chat_log_write'
  | 'room_playback_history_write';

const DEFAULTS: Record<Bucket, { user: number; guest: number; ip: number }> = {
  character_chat: { user: 20, guest: 8, ip: 12 },
  resolve_song_request: { user: 15, guest: 5, ip: 10 },
  comment_pack: { user: 12, guest: 4, ip: 8 },
  commentary: { user: 12, guest: 4, ip: 8 },
  song_quiz: { user: 10, guest: 3, ip: 6 },
  feedback: { user: 8, guest: 3, ip: 5 },
  announce_song: { user: 20, guest: 8, ip: 12 },
  room_chat_log_write: { user: 60, guest: 30, ip: 40 },
  room_playback_history_write: { user: 40, guest: 15, ip: 25 },
};

function envPrefix(bucket: Bucket): string {
  return `AI_COST_RL_${bucket.toUpperCase()}`;
}

function getMax(bucket: Bucket, kind: 'user' | 'guest' | 'ip'): number {
  const d = DEFAULTS[bucket][kind];
  return parseRateLimitEnv(process.env[`${envPrefix(bucket)}_${kind.toUpperCase()}`], d);
}

function getStore(): { map?: Map<string, number[]> } {
  const g = globalThis as unknown as { __aiCostRateLimitStore?: { map?: Map<string, number[]> } };
  if (!g.__aiCostRateLimitStore) g.__aiCostRateLimitStore = {};
  return g.__aiCostRateLimitStore;
}

/**
 * IP 必須。userId があればユーザー単位も併用（厳しい方で拒否）。
 */
export function checkAiCostRateLimit(params: {
  bucket: Bucket;
  clientIp: string;
  userId?: string | null;
  isGuest?: boolean;
}): AiCostRateLimitResult {
  const ip = (params.clientIp || 'unknown').trim() || 'unknown';
  const store = getStore();
  const ipMax = getMax(params.bucket, 'ip');
  const ipResult = checkSlidingWindowRateLimit({
    store,
    key: `${params.bucket}:ip:${ip}`,
    max: ipMax,
  });
  if (!ipResult.ok) return ipResult;

  const uid = params.userId?.trim();
  if (uid) {
    return checkSlidingWindowRateLimit({
      store,
      key: `${params.bucket}:user:${uid}`,
      max: getMax(params.bucket, 'user'),
    });
  }

  if (params.isGuest) {
    return checkSlidingWindowRateLimit({
      store,
      key: `${params.bucket}:guest:${ip}`,
      max: getMax(params.bucket, 'guest'),
    });
  }

  return { ok: true };
}

/** 単体テスト用にストアを空にする */
export function resetAiCostRateLimitStoreForTests(): void {
  const g = globalThis as unknown as { __aiCostRateLimitStore?: { map?: Map<string, number[]> } };
  if (g.__aiCostRateLimitStore) g.__aiCostRateLimitStore.map = new Map();
}
