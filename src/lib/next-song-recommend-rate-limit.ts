/**
 * 「次に聴くなら」API 用: ログインユーザー ID 単位の簡易レート制限（60 秒窓）。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(): number {
  const raw = process.env.NEXT_SONG_RECOMMEND_RATE_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 8;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  return 8;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __nextSongRecommendRateTimestamps?: Map<string, number[]> };
  if (!g.__nextSongRecommendRateTimestamps) g.__nextSongRecommendRateTimestamps = new Map();
  return g.__nextSongRecommendRateTimestamps;
}

export type NextSongRecommendRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkNextSongRecommendRateLimit(userId: string): NextSongRecommendRateLimitResult {
  const max = getMaxPerWindow();
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `uid:${userId}`;
  const prev = store.get(key) ?? [];
  const windowStart = now - WINDOW_MS;
  const cut = prev.filter((t) => t > windowStart);
  if (cut.length >= max) {
    const oldest = cut[0]!;
    const retryAfterMs = Math.max(0, WINDOW_MS - (now - oldest));
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  cut.push(now);
  store.set(key, cut);
  if (store.size > 4000) {
    store.forEach((v, k) => {
      const nv = v.filter((t: number) => t > windowStart);
      if (nv.length === 0) store.delete(k);
      else store.set(k, nv);
    });
  }
  return { ok: true };
}
