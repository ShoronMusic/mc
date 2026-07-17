/**
 * YouTube プレイリスト取得 API 乱用対策: IP 単位（60秒スライディング）。
 * 既定 10 回/60 秒。`YOUTUBE_PLAYLIST_RATE_LIMIT_PER_MINUTE` で 1〜60 を指定可能。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(): number {
  const raw = process.env.YOUTUBE_PLAYLIST_RATE_LIMIT_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 10;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  return 10;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __youtubePlaylistRateTimestamps?: Map<string, number[]> };
  if (!g.__youtubePlaylistRateTimestamps) g.__youtubePlaylistRateTimestamps = new Map();
  return g.__youtubePlaylistRateTimestamps;
}

export type YoutubePlaylistRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkYoutubePlaylistRateLimit(clientIp: string): YoutubePlaylistRateLimitResult {
  const max = getMaxPerWindow();
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `ytpl:${clientIp || 'unknown'}`;
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
