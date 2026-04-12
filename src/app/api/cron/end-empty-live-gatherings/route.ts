import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmptyLiveGatheringThresholdMs, sweepEmptyLiveGatherings } from '@/lib/empty-live-gathering-cron';

export const dynamic = 'force-dynamic';
/** 多数の部屋 × Ably を考慮 */
export const maxDuration = 60;

/**
 * Vercel Cron 等から GET。`Authorization: Bearer CRON_SECRET` 必須。
 * 在室が一度記録されたあと 0 が続き閾値を超えた live を ended にする。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET が未設定です。Vercel の環境変数に設定してください。' },
      { status: 503 },
    );
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' },
      { status: 503 },
    );
  }

  const result = await sweepEmptyLiveGatherings(admin);
  return NextResponse.json({
    ok: true,
    thresholdMs: getEmptyLiveGatheringThresholdMs(),
    ...result,
  });
}
