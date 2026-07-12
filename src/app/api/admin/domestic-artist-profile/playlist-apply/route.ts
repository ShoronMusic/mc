import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import {
  applyDomesticArtistPlaylistItems,
  type ApplyDomesticArtistPlaylistItemInput,
} from '@/lib/admin-domestic-artist-playlist';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ReqBody = {
  items?: unknown;
  dryRun?: unknown;
  forceAllow?: unknown;
  skipExisting?: unknown;
  artistName?: unknown;
};

function parseItems(raw: unknown): ApplyDomesticArtistPlaylistItemInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ApplyDomesticArtistPlaylistItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const videoId = typeof o.videoId === 'string' ? o.videoId.trim() : '';
    const artist = typeof o.artist === 'string' ? o.artist.trim() : '';
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!videoId || !artist || !title) continue;
    out.push({
      videoId,
      artist,
      title,
      displayTitle: typeof o.displayTitle === 'string' ? o.displayTitle : undefined,
      releaseDate: typeof o.releaseDate === 'string' ? o.releaseDate : null,
      songTitleJa: typeof o.songTitleJa === 'string' ? o.songTitleJa : null,
      youtubeDate: typeof o.youtubeDate === 'string' ? o.youtubeDate : null,
      genres: Array.isArray(o.genres)
        ? o.genres.filter((g): g is string => typeof g === 'string')
        : undefined,
      include: o.include !== false,
      rawTitle: typeof o.rawTitle === 'string' ? o.rawTitle : null,
      channelTitle: typeof o.channelTitle === 'string' ? o.channelTitle : null,
      channelId: typeof o.channelId === 'string' ? o.channelId : null,
      creditArtists: Array.isArray(o.creditArtists)
        ? o.creditArtists.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const items = parseItems(body.items);
  if (!items) {
    return NextResponse.json({ error: 'items が必要です。' }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const dryRun = body.dryRun === true || body.dryRun === '1';
  const forceAllow = body.forceAllow === true || body.forceAllow === '1';
  const skipExisting = body.skipExisting !== false && body.skipExisting !== '0';
  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : null;

  try {
    const results = await applyDomesticArtistPlaylistItems(admin, items, {
      dryRun,
      forceAllow,
      skipExisting,
      registrationArtistName: artistName,
    });

    if (!dryRun) clearLibraryArtistIndexCache();

    const summary = {
      total: results.length,
      imported: results.filter((r) => r.status === 'imported').length,
      dryRun: results.filter((r) => r.status === 'dry_run').length,
      skippedExisting: results.filter((r) => r.status === 'skipped_existing').length,
      skippedExcluded: results.filter((r) => r.status === 'skipped_excluded').length,
      skippedGate: results.filter((r) => r.status === 'skipped_gate').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    return NextResponse.json({ ok: true, dryRun, results, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'プレイリスト投入に失敗しました。';
    console.error('[admin/domestic-artist-profile/playlist-apply]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
