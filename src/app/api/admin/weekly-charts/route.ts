import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  bindWeeklyChartEntry,
  importWeeklyChart,
  isWeeklyChartRegion,
  loadLatestWeeklyCharts,
} from '@/lib/weekly-charts';

export const dynamic = 'force-dynamic';

function tableMissingResponse() {
  return NextResponse.json(
    {
      error: '週間チャート用テーブルが未作成です。docs/sql/weekly-charts.sql を実行してください。',
    },
    { status: 503 },
  );
}

/** GET: 直近の US / UK 取込（DB 再照合） */
export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { us, uk, error, tableMissing } = await loadLatestWeeklyCharts(admin);
  if (tableMissing) return tableMissingResponse();
  if (error) {
    console.error('[admin/weekly-charts] GET', error);
    return NextResponse.json({ error: '週間チャートの取得に失敗しました。' }, { status: 500 });
  }

  return NextResponse.json({ us, uk });
}

/** POST: Spotify 公式プレイリスト上位 10 を取り込み、既存曲と照合 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const region = body?.region;
  if (!isWeeklyChartRegion(region)) {
    return NextResponse.json({ error: 'region は us または uk です。' }, { status: 400 });
  }

  const { issue, error, tableMissing } = await importWeeklyChart(admin, region);
  if (tableMissing) return tableMissingResponse();
  if (error || !issue) {
    return NextResponse.json({ error: error || '取込に失敗しました。' }, { status: 400 });
  }

  return NextResponse.json({ issue });
}

/** PATCH: チャート行の紐づけ曲を差し替え（YouTube URL / 動画ID / 曲 UUID） */
export async function PATCH(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
  const target = typeof body?.target === 'string' ? body.target : typeof body?.songId === 'string' ? body.songId : '';
  const { issue, error, tableMissing } = await bindWeeklyChartEntry(admin, entryId, target);
  if (tableMissing) return tableMissingResponse();
  if (error || !issue) {
    return NextResponse.json({ error: error || '紐づけの変更に失敗しました。' }, { status: 400 });
  }

  return NextResponse.json({ issue });
}
