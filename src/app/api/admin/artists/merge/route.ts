import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  autoMergeHighConfidenceArtists,
  mergeArtistRows,
  type ArtistMergeRow,
} from '@/lib/admin-artist-merge';

export const dynamic = 'force-dynamic';

type Body = {
  mode?: 'pair' | 'auto';
  keepId?: string;
  loseId?: string;
  dryRun?: boolean;
  updateMainArtist?: boolean;
  sinceDays?: number;
};

async function loadArtist(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string) {
  const { data, error } = await admin
    .from('artists')
    .select(
      'id, name, name_ja, name_en, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, spotify_artist_id, origin_country, profile_text, created_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ArtistMergeRow | null;
}

/**
 * POST /api/admin/artists/merge
 * - mode=auto: 高信頼重複を一括マージ（既定 dryRun=false）
 * - mode=pair: keepId + loseId を1組マージ
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const updateMainArtist = body.updateMainArtist !== false;
  const mode = body.mode === 'pair' ? 'pair' : 'auto';

  try {
    if (mode === 'pair') {
      const keepId = body.keepId?.trim();
      const loseId = body.loseId?.trim();
      if (!keepId || !loseId) {
        return NextResponse.json({ error: 'keepId と loseId が必要です' }, { status: 400 });
      }
      const keep = await loadArtist(admin, keepId);
      const lose = await loadArtist(admin, loseId);
      if (!keep || !lose) {
        return NextResponse.json({ error: 'artists が見つかりません' }, { status: 404 });
      }
      const result = await mergeArtistRows(admin, keep, lose, { dryRun, updateMainArtist });
      return NextResponse.json({ ok: true, mode: 'pair', result });
    }

    const report = await autoMergeHighConfidenceArtists(admin, {
      dryRun,
      sinceDays: body.sinceDays ?? 90,
      updateMainArtist,
    });
    return NextResponse.json({
      ok: true,
      mode: 'auto',
      dryRun,
      pairsFound: report.pairsFound,
      pairs: report.pairs.map((p) => ({
        keepId: p.keep.id,
        keepName: p.keep.name,
        loseId: p.lose.id,
        loseName: p.lose.name,
        reasons: p.reasons,
      })),
      merged: report.merged,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[admin/artists/merge]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
