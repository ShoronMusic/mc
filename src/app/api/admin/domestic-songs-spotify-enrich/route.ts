import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  clampDomesticSpotifyEnrichLimit,
  runDomesticSongsSpotifyEnrich,
} from '@/lib/admin-domestic-spotify-enrich';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ReqBody = {
  dryRun?: unknown;
  songIds?: unknown;
  artistName?: unknown;
  limit?: unknown;
  /** 曲詳細からの明示取得: catalog フィルタを外す */
  ignoreCatalogFilter?: unknown;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dryRun = body.dryRun !== false && body.dryRun !== '0';
  const ignoreCatalogFilter =
    body.ignoreCatalogFilter === true || body.ignoreCatalogFilter === '1';
  const limit = clampDomesticSpotifyEnrichLimit(body.limit);
  const artistName =
    typeof body.artistName === 'string' ? body.artistName.trim() : undefined;
  const songIds = Array.isArray(body.songIds)
    ? body.songIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : undefined;

  if ((!songIds || songIds.length === 0) && !artistName) {
    return NextResponse.json({ error: 'songIds または artistName が必要です。' }, { status: 400 });
  }

  try {
    const { summary, results } = await runDomesticSongsSpotifyEnrich(admin, {
      dryRun,
      songIds,
      artistName,
      limit,
      ignoreCatalogFilter,
    });
    return NextResponse.json({ ok: true, dryRun, summary, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Spotify 一括取得に失敗しました。';
    console.error('[admin/domestic-songs-spotify-enrich]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
