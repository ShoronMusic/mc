import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';
import { formatInfraCostJpyApprox } from '@/lib/infra-cost-estimates';
import {
  aggregateUserBillingDetail,
  aggregateUserBillingSummaries,
} from '@/lib/admin-user-billing-aggregate';

export const dynamic = 'force-dynamic';

/**
 * GET: ユーザー別課金帰属集計（Gemini・選曲）
 * ?days=30 & ?userId=... で詳細（スロット内訳）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId')?.trim() || '';
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const roomId = url.searchParams.get('roomId')?.trim() || '';

  if (userId) {
    try {
      const detail = await aggregateUserBillingDetail(admin, userId, { lookbackDays: days });
      if (!detail.summary) {
        return NextResponse.json({ enabled: true, summary: null, slots: [] });
      }
      return NextResponse.json({ enabled: true, mode: 'user_billing', ...detail });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '集計エラー';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const rows = await aggregateUserBillingSummaries(admin, {
      lookbackDays: days,
      roomId: roomId || null,
    });

    const totals = rows.reduce(
      (acc, row) => {
        acc.users += 1;
        acc.songs += row.songCount;
        acc.geminiCalls += row.gemini.calls;
        acc.geminiJpy += row.gemini.costJpyApprox;
        acc.youtubeCalls += row.youtube_api?.calls ?? 0;
        acc.youtubeQuotaUnits += row.youtube_api?.quotaUnits ?? 0;
        acc.youtubeJpy += row.youtube_api?.costJpyApprox ?? 0;
        acc.ablyMessages += row.ably?.messagesEstimated ?? 0;
        acc.ablyJpy += row.ably?.costJpyApprox ?? 0;
        acc.totalJpy += row.total_cost_jpy_approx ?? 0;
        return acc;
      },
      {
        users: 0,
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
      mode: 'user_billing',
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
        hint: 'gemini_usage_logs がありません。docs/supabase-gemini-usage-logs-table.md を確認してください。',
        rows: [],
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
