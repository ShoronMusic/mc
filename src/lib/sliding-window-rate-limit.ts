/**
 * プロセス内スライディングウィンドウレート制限（サーバーレスではインスタンス単位）。
 */

export type SlidingWindowRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type StoreHolder = { map?: Map<string, number[]> };

export function checkSlidingWindowRateLimit(params: {
  store: StoreHolder;
  key: string;
  max: number;
  windowMs?: number;
  maxKeys?: number;
}): SlidingWindowRateLimitResult {
  const windowMs = params.windowMs ?? 60_000;
  const maxKeys = params.maxKeys ?? 5000;
  const max = Math.max(1, Math.floor(params.max));
  if (!params.store.map) params.store.map = new Map();
  const store = params.store.map;
  const now = Date.now();
  const prev = store.get(params.key) ?? [];
  const windowStart = now - windowMs;
  const cut = prev.filter((t) => t > windowStart);
  if (cut.length >= max) {
    const oldest = cut[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  cut.push(now);
  store.set(params.key, cut);
  if (store.size > maxKeys) {
    store.forEach((v, k) => {
      const nv = v.filter((t) => t > windowStart);
      if (nv.length === 0) store.delete(k);
      else store.set(k, nv);
    });
  }
  return { ok: true };
}

export function parseRateLimitEnv(
  raw: string | undefined,
  fallback: number,
  min = 1,
  max = 120,
): number {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= min && n <= max) return n;
  return fallback;
}
