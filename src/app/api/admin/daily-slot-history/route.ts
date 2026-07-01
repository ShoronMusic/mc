import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';
import { formatInfraCostJpyApprox } from '@/lib/infra-cost-estimates';
import {
  aggregateDailySlotDetail,
  aggregateDailySlotSummaries,
} from '@/lib/room-daily-slot-aggregate';

export const dynamic = 'force-dynamic';

/**
 * GET: 部屋 × 12h スロット（06–18 / 18–06）の AI・選曲集計
 * ?days=14 & ?slotKey=... で詳細
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const slotKey = url.searchParams.get('slotKey')?.trim() || '';
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10) || 14));
  const roomId = url.searchParams.get('roomId')?.trim() || '';

  if (slotKey) {
    try {
      const detail = await aggregateDailySlotDetail(admin, slotKey);
      if (!detail.summary) {
        return NextResponse.json({ enabled: true, summary: null, users: [] });
      }
      return NextResponse.json({ enabled: true, mode: 'daily_slot', ...detail });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '集計エラー';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const rows = await aggregateDailySlotSummaries(admin, {
      lookbackDays: days,
      roomId: roomId || null,
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.slots += 1;
        acc.songs += row.song_count_total;
        acc.geminiCalls += row.gemini.calls;
        acc.geminiJpy += row.gemini.costJpyApprox;
        acc.youtubeCalls += row.youtube_api.calls;
        acc.youtubeQuotaUnits += row.youtube_api.quotaUnits;
        acc.youtubeJpy += row.youtube_api.costJpyApprox;
        acc.ablyMessages += row.ably.messagesEstimated;
        acc.ablyJpy += row.ably.costJpyApprox;
        acc.totalJpy += row.total_cost_jpy_approx;
        return acc;
      },
      {
        slots: 0,
        songs: 0,
        geminiCalls: 0,
        geminiJpy: 0,
        youtubeCalls: 0,
        youtubeQuotaUnits: 0,
        youtubeJpy: 0,
        ablyMessages: 0,
        ablyJpy: 0,
        totalJpy: 0,
      },
    );

    return NextResponse.json({
      enabled: true,
      mode: 'daily_slot',
      lookbackDays: days,
      totals: {
        ...totals,
        geminiJpyLabel: formatGeminiCostJpyApprox(totals.geminiJpy),
        youtubeJpyLabel: formatInfraCostJpyApprox(totals.youtubeJpy),
        ablyJpyLabel: formatInfraCostJpyApprox(totals.ablyJpy),
        totalJpyLabel: formatInfraCostJpyApprox(totals.totalJpy),
      },
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '集計エラー';
    if (msg.includes('42P01') || msg.includes('gemini_usage_logs')) {
      return NextResponse.json({
        enabled: false,
        hint: 'gemini_usage_logs 等のテーブルがありません。docs/supabase-gemini-usage-logs-table.md を確認してください。',
        rows: [],
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
