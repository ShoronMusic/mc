import { NextResponse } from 'next/server';
import type { AiCostRateLimitResult } from '@/lib/ai-cost-rate-limit';

export function aiCostRateLimitResponse(rate: AiCostRateLimitResult): NextResponse | null {
  if (rate.ok) return null;
  return NextResponse.json(
    {
      error: 'rate_limit',
      message: '短時間にリクエストが集中しています。しばらく待ってから再度お試しください。',
      retryAfterSec: rate.retryAfterSec,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfterSec) },
    },
  );
}
