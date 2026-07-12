import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { formatGeminiCostJpyApprox } from '@/lib/gemini-pricing';
import { formatInfraCostJpyApprox } from '@/lib/infra-cost-estimates';
import { aggregateRoomCostSummaries } from '@/lib/room-cost-aggregate';
import { parseAdminProductFilter } from '@/lib/room-history-product';

export const dynamic = 'force-dynamic';

/**
 * GET: 部屋単位・主催者単位の原価集計（Gemini + YouTube API + 選曲）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const roomId = url.searchParams.get('roomId')?.trim() || '';
  const ownerUserId = url.searchParams.get('ownerUserId')?.trim() || '';
  const productFilter = parseAdminProductFilter(url.searchParams.get('product'));

  try {
    const { rooms, owners } = await aggregateRoomCostSummaries(admin, {
      lookbackDays: days,
      roomId: roomId || null,
      ownerUserId: ownerUserId || null,
      productFilter,
    });

    const totals = rooms.reduce(
      (acc, row) => {
        acc.rooms += 1;
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
        rooms: 0,
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
      lookbackDays: days,
      totals: {
        ...totals,
        geminiJpyLabel: formatGeminiCostJpyApprox(totals.geminiJpy),
        youtubeJpyLabel: formatInfraCostJpyApprox(totals.youtubeJpy),
        ablyJpyLabel: formatInfraCostJpyApprox(totals.ablyJpy),
        totalJpyLabel: formatInfraCostJpyApprox(totals.totalJpy),
        ownerCount: owners.length,
      },
      rooms,
      owners,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '集計エラー';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
