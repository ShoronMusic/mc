/**
 * Music8 プレイリスト API 乱用対策: IP 単位（60秒スライディング）。
 * 既定 10 回/60 秒。`MUSIC8_PLAYLIST_RATE_LIMIT_PER_MINUTE` で 1〜60 を指定可能。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(): number {
  const raw = process.env.MUSIC8_PLAYLIST_RATE_LIMIT_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 10;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 60) return n;
  return 10;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __m8PlaylistRateTimestamps?: Map<string, number[]> };
  if (!g.__m8PlaylistRateTimestamps) g.__m8PlaylistRateTimestamps = new Map();
  return g.__m8PlaylistRateTimestamps;
}

export type Music8PlaylistRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkMusic8PlaylistRateLimit(clientIp: string): Music8PlaylistRateLimitResult {
  const max = getMaxPerWindow();
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `m8pl:${clientIp || 'unknown'}`;
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
