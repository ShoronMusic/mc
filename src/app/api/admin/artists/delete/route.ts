import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteArtistIfUnused, inspectArtistDelete } from '@/lib/admin-artist-delete';
import { normalizeSongDeleteConfirmText } from '@/lib/admin-song-delete-confirm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/artists/delete
 * body: { artistId, confirmName, dryRun? }
 * 曲参照がある行は削除不可（重複スタブ向け）。
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });
  }

  let body: { artistId?: string; confirmName?: string; dryRun?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const artistId = body.artistId?.trim();
  if (!artistId) {
    return NextResponse.json({ error: 'artistId が必要です' }, { status: 400 });
  }

  try {
    const check = await inspectArtistDelete(admin, artistId);
    if (!check) {
      return NextResponse.json({ error: 'アーティストが見つかりません' }, { status: 404 });
    }

    if (body.dryRun === true) {
      return NextResponse.json({ ok: true, dryRun: true, check });
    }

    const expected = normalizeSongDeleteConfirmText(check.name ?? '');
    const got = normalizeSongDeleteConfirmText(body.confirmName ?? '');
    if (!expected || got !== expected) {
      return NextResponse.json(
        {
          error: `確認のため、表示名「${check.name ?? ''}」を正確に入力してください。`,
          check,
        },
        { status: 400 },
      );
    }

    const result = await deleteArtistIfUnused(admin, artistId, {
      unlinkOrphanArtistIds: true,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, check: result.check }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      deletedId: result.deletedId,
      unlinkedSongIds: result.unlinkedSongIds ?? [],
      check,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[admin/artists/delete]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
