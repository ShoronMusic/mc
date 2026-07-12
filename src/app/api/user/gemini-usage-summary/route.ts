import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { aggregateUserGeminiUsage, type UserGeminiUsageLogRow } from '@/lib/user-gemini-usage-aggregate';
import type { ParticipationHistoryRow } from '@/lib/participation-summary';
import {
  getRoomHistoryProductId,
  runRoomHistoryQueryScoped,
  withRoomHistoryProductEq,
} from '@/lib/room-history-product';

export const dynamic = 'force-dynamic';

const LOG_LOOKBACK_DAYS = 120;
const MAX_LOG_ROWS = 8000;

const LOG_SELECT =
  'context, model, prompt_token_count, output_token_count, room_id, created_at, billing_kind, billing_user_id, trigger_user_id, user_id';

/**
 * GET: ログインユーザー自身の Gemini 利用を参加スロット・月次に集計
 * 請求先 billing_user_id ベース。personal / roomCommon に分割。
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ enabled: false, error: 'ログインが必要です。' }, { status: 401 });
  }

  const historyProduct = getRoomHistoryProductId();
  const partRes = await runRoomHistoryQueryScoped((scopeProduct) => {
    let q = supabase
      .from('user_room_participation_history')
      .select('id, room_id, gathering_id, gathering_title, display_name, joined_at, left_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(200);
    if (scopeProduct) q = withRoomHistoryProductEq(q, historyProduct);
    return q;
  });
  const { data: participationRows, error: partErr } = partRes;

  if (partErr && partErr.code !== '42P01') {
    console.error('[user/gemini-usage-summary] participation', partErr);
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }

  const participationHistory = (participationRows ?? []) as ParticipationHistoryRow[];

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({
      enabled: false,
      hint: 'サーバーに SUPABASE_SERVICE_ROLE_KEY がありません。利用量の集計には管理者キーが必要です。',
      participationHistoryCount: participationHistory.length,
      bySlot: {},
      monthly: [],
      totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
      personal: { totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 } },
      roomCommon: { totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 } },
    });
  }

  const since = new Date(Date.now() - LOG_LOOKBACK_DAYS * 86400000).toISOString();
  const uid = user.id;

  const billingRes = await runRoomHistoryQueryScoped((scopeProduct) => {
    let q = admin
      .from('gemini_usage_logs')
      .select(LOG_SELECT)
      .eq('billing_user_id', uid)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_LOG_ROWS);
    if (scopeProduct) q = withRoomHistoryProductEq(q, historyProduct);
    return q;
  });
  const { data: billingRows, error: billingErr } = billingRes;

  if (billingErr?.code === '42P01') {
    return NextResponse.json({
      enabled: false,
      hint: 'gemini_usage_logs テーブルがありません。',
      participationHistoryCount: participationHistory.length,
      bySlot: {},
      monthly: [],
      totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
    });
  }

  if (billingErr?.code === '42703') {
    const legacyRes = await runRoomHistoryQueryScoped((scopeProduct) => {
      let q = admin
        .from('gemini_usage_logs')
        .select('context, model, prompt_token_count, output_token_count, room_id, created_at, user_id')
        .eq('user_id', uid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_LOG_ROWS);
      if (scopeProduct) q = withRoomHistoryProductEq(q, historyProduct);
      return q;
    });
    const { data: legacyRows, error: legacyErr } = legacyRes;

    if (legacyErr) {
      if (legacyErr.code === '42703') {
        return NextResponse.json({
          enabled: false,
          hint:
            'gemini_usage_logs に user_id 列がありません。docs/supabase-gemini-usage-logs-table.md の追記 SQL を実行してください。',
          participationHistoryCount: participationHistory.length,
          bySlot: {},
          monthly: [],
          totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
        });
      }
      if (legacyErr.code === '42P01') {
        return NextResponse.json({
          enabled: false,
          hint: 'gemini_usage_logs テーブルがありません。',
          participationHistoryCount: participationHistory.length,
          bySlot: {},
          monthly: [],
          totals: { calls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0, costJpyApprox: 0 },
        });
      }
      return NextResponse.json({ error: legacyErr.message }, { status: 500 });
    }

    const aggregate = aggregateUserGeminiUsage(
      participationHistory,
      (legacyRows ?? []) as UserGeminiUsageLogRow[],
      uid,
    );
    return NextResponse.json({
      enabled: true,
      lookbackDays: LOG_LOOKBACK_DAYS,
      participationHistoryCount: participationHistory.length,
      billingMode: 'legacy_user_id',
      ...aggregate,
    });
  }

  if (billingErr && billingErr.code !== '42P01') {
    console.error('[user/gemini-usage-summary] logs', billingErr);
    return NextResponse.json({ error: billingErr.message }, { status: 500 });
  }

  const legacyRes = await runRoomHistoryQueryScoped((scopeProduct) => {
    let q = admin
      .from('gemini_usage_logs')
      .select(LOG_SELECT)
      .eq('user_id', uid)
      .is('billing_user_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_LOG_ROWS);
    if (scopeProduct) q = withRoomHistoryProductEq(q, historyProduct);
    return q;
  });
  const { data: legacyRows } = legacyRes;

  const mergedLogs = [...(billingRows ?? []), ...(legacyRows ?? [])] as UserGeminiUsageLogRow[];

  const aggregate = aggregateUserGeminiUsage(participationHistory, mergedLogs, uid);

  return NextResponse.json({
    enabled: true,
    lookbackDays: LOG_LOOKBACK_DAYS,
    participationHistoryCount: participationHistory.length,
    billingMode: 'billing_user_id',
    ...aggregate,
  });
}
