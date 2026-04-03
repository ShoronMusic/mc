/**
 * /api/ai/question-guard-classify 用 IP レート制限（/api/ai/chat とは別バケット）。
 */

const WINDOW_MS = 60_000;

function getMaxPerWindow(isGuest: boolean): number {
  if (isGuest) {
    const raw = process.env.QUESTION_GUARD_CLASSIFY_PER_MINUTE_GUEST;
    if (raw == null || String(raw).trim() === '') return 30;
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
    return 30;
  }
  const raw = process.env.QUESTION_GUARD_CLASSIFY_PER_MINUTE;
  if (raw == null || String(raw).trim() === '') return 60;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
  return 60;
}

function getTimestampsMap(): Map<string, number[]> {
  const g = globalThis as unknown as { __questionGuardClassifyRateTs?: Map<string, number[]> };
  if (!g.__questionGuardClassifyRateTs) g.__questionGuardClassifyRateTs = new Map();
  return g.__questionGuardClassifyRateTs;
}

export function getQuestionGuardClassifyClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}

export type QuestionGuardClassifyRateResult = { ok: true } | { ok: false; retryAfterSec: number };

export function checkQuestionGuardClassifyRateLimit(
  clientIp: string,
  isGuest = false
): QuestionGuardClassifyRateResult {
  const max = getMaxPerWindow(isGuest);
  const now = Date.now();
  const store = getTimestampsMap();
  const key = `qg:${clientIp}`;
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
