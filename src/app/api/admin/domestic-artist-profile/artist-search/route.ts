import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { searchArtistsForAdminLink } from '@/lib/artist-members';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const excludeId = (url.searchParams.get('excludeId') ?? '').trim() || null;
  if (q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  try {
    const items = await searchArtistsForAdminLink(admin, q, { excludeId, limit: 12 });
    return NextResponse.json({ items });
  } catch (e) {
    console.error('[admin/domestic-artist-profile/artist-search]', e);
    const msg = e instanceof Error ? e.message : '検索に失敗しました。';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
