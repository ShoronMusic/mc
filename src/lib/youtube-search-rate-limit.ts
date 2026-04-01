/**
 * YouTube Data API `search.list` 乱用・クォータ対策: IP 単位（60秒スライディング）。
 * 既定 5 回/60 秒。`YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE` で 1〜60 を指定可能。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(isGuest: boolean): number {
  if (isGuest) {
    const rawGuest = process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE_GUEST;
    if (rawGuest == null || String(rawGuest).trim() === '') return 3;
    const ng = parseInt(String(rawGuest), 10);
    if (Number.isFinite(ng) && ng >= 1 && ng <= 60) return ng;
    return 3;
  }
  const raw = process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 5;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  return 5;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __ytSearchRateTimestamps?: Map<string, number[]> };
  if (!g.__ytSearchRateTimestamps) g.__ytSearchRateTimestamps = new Map();
  return g.__ytSearchRateTimestamps;
}

export type YouTubeSearchRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkYouTubeSearchRateLimit(clientIp: string, isGuest = false): YouTubeSearchRateLimitResult {
  const max = getMaxPerWindow(isGuest);
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `ytsearch:${clientIp}`;
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
  if (store.size > 5000) {
    store.forEach((v, k) => {
      const nv = v.filter((t: number) => t > windowStart);
      if (nv.length === 0) store.delete(k);
      else store.set(k, nv);
    });
  }
  return { ok: true };
}
