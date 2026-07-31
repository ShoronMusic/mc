import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  fetchAdminUserAiTrialDetail,
  fetchAdminUserAiTrialOverview,
  listAdminAiTrialAbuseEvents,
  listAdminUserAiTrialRows,
  type AdminTrialStatusFilter,
} from '@/lib/admin-user-ai-trial-aggregate';

export const dynamic = 'force-dynamic';

function parseStatusFilter(value: string | null): AdminTrialStatusFilter {
  const v = value?.trim();
  if (v === 'active' || v === 'exhausted' || v === 'at_remaining' || v === 'partial') return v;
  return 'all';
}

function parseSort(value: string | null): 'updated_desc' | 'created_desc' | 'songs_remaining_asc' {
  const v = value?.trim();
  if (v === 'created_desc' || v === 'songs_remaining_asc') return v;
  return 'updated_desc';
}

/**
 * GET: AI お試し trial ユーザー一覧・サマリー・詳細
 * ?userId=... 詳細 · ?status=active|exhausted|... · ?q= · ?limit= · ?offset=
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

  if (userId) {
    try {
      const { detail, missingTable } = await fetchAdminUserAiTrialDetail(admin, userId);
      if (missingTable) {
        return NextResponse.json({
          enabled: false,
          missingTable: true,
          hint: 'user_ai_trial テーブルが未作成です。docs/supabase-user-ai-trial-table.md',
        });
      }
      return NextResponse.json({ enabled: true, mode: 'detail', detail });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '読み込みエラー';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  try {
    const overview = await fetchAdminUserAiTrialOverview(admin);
    if (!overview.enabled) {
      return NextResponse.json({
        enabled: false,
        missingTable: true,
        hint: 'user_ai_trial テーブルが未作成です。docs/supabase-user-ai-trial-table.md',
      });
    }

    const list = await listAdminUserAiTrialRows(admin, {
      status: parseStatusFilter(url.searchParams.get('status')),
      q: url.searchParams.get('q') ?? '',
      limit: parseInt(url.searchParams.get('limit') || '50', 10) || 50,
      offset: parseInt(url.searchParams.get('offset') || '0', 10) || 0,
      sort: parseSort(url.searchParams.get('sort')),
    });

    const abuse = await listAdminAiTrialAbuseEvents(admin, { limit: 30 });

    return NextResponse.json({
      enabled: true,
      mode: 'list',
      overview,
      rows: list.rows,
      total: list.total,
      enforcementEnabled: overview.enforcementEnabled,
      abuseEvents: abuse.rows,
      abuseEventsMissingTable: abuse.missingTable,
      abuseEventsError: abuse.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '集計エラー';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
