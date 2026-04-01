/**
 * /api/ai/chat のコスト・乱用対策: IP 単位の簡易レート制限（サーバーレスではインスタンス単位）。
 * 本番で厳密に制限したい場合はエッジ／WAF 側の制限と併用を推奨。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(isGuest: boolean): number {
  if (isGuest) {
    const rawGuest = process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE_GUEST;
    if (rawGuest == null || String(rawGuest).trim() === '') return 10;
    const ng = parseInt(String(rawGuest), 10);
    if (Number.isFinite(ng) && ng >= 1 && ng <= 120) return ng;
    return 10;
  }
  const raw = process.env.CHAT_AI_RATE_LIMIT_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 20;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
  return 20;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __chatAiRateTimestamps?: Map<string, number[]> };
  if (!g.__chatAiRateTimestamps) g.__chatAiRateTimestamps = new Map();
  return g.__chatAiRateTimestamps;
}

/** プロキシ経由のクライアント IP（同一 LAN 内の複数ユーザーはまとまる場合あり） */
export function getChatAiClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

export type ChatAiRateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * 直近 60 秒以内に `max` 回を超えたら拒否。
 */
export function checkChatAiRateLimit(clientIp: string, isGuest = false): ChatAiRateLimitResult {
  const max = getMaxPerWindow(isGuest);
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `ip:${clientIp}`;
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
