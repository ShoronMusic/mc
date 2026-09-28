import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { loadAiUsageFeeBreakdown } from '@/lib/admin-ai-usage-fee-breakdown';
import { parseAdminProductFilter } from '@/lib/room-history-product';

export const dynamic = 'force-dynamic';

/** GET: 月・日・累計の AI 原価（機能 × 使用者／主催者） */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const productFilter = parseAdminProductFilter(url.searchParams.get('product'));

  try {
    const result = await loadAiUsageFeeBreakdown(admin, { productFilter });
    if (!result.enabled || !result.breakdown) {
      return NextResponse.json({ enabled: false, hint: result.hint ?? null, breakdown: null });
    }
    return NextResponse.json({ enabled: true, breakdown: result.breakdown });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '集計エラー';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
