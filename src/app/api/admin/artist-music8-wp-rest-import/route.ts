import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  normalizeMusic8ArtistSource,
  upsertArtistFromMusic8Json,
} from '@/lib/music8-artist-import';
import { fetchMusic8ArtistFromWpRest, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';

export const dynamic = 'force-dynamic';

/**
 * POST: WordPress REST API からアーティスト（category）を取得し artists を補完。
 * Body: { artistId?: string, artistName?: string, music8ArtistSlug?: string }
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  if (!isMusic8WpRestEnabled()) {
    return NextResponse.json(
      { error: 'MUSIC8_WP_REST_BASE_URL が無効です（0/off/false でオフ）。' },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { artistId?: string; artistName?: string; music8ArtistSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
  let artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  let music8Slug =
    typeof body.music8ArtistSlug === 'string' ? body.music8ArtistSlug.trim().toLowerCase() : '';

  if (artistId) {
    const { data: row, error } = await admin
      .from('artists')
      .select('id, name, name_ja, music8_artist_slug')
      .eq('id', artistId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'アーティストが見つかりません。' }, { status: 404 });
    }
    const cast = row as {
      name?: string | null;
      name_ja?: string | null;
      music8_artist_slug?: string | null;
    };
    if (!artistName) artistName = (cast.name ?? cast.name_ja ?? '').trim();
    if (!music8Slug) music8Slug = (cast.music8_artist_slug ?? '').trim().toLowerCase();
  }

  if (!artistName && !music8Slug) {
    return NextResponse.json({ error: 'artistName または music8ArtistSlug が必要です。' }, { status: 400 });
  }

  const lookup = music8Slug || artistName;
  let music8Json: Record<string, unknown> | null = null;
  try {
    music8Json = await fetchMusic8ArtistFromWpRest(lookup);
    if (!music8Json && artistName && music8Slug && artistName !== music8Slug) {
      music8Json = await fetchMusic8ArtistFromWpRest(artistName);
    }
  } catch (e) {
    console.error('[admin/artist-music8-wp-rest-import] fetch', e);
    return NextResponse.json({ error: 'WordPress REST の取得中にエラーが発生しました。' }, { status: 502 });
  }

  if (!music8Json || !normalizeMusic8ArtistSource(music8Json)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'not_found',
        error:
          'WordPress REST に該当するアーティスト（category）が見つかりませんでした。slug・表記を確認してください。',
      },
      { status: 404 },
    );
  }

  const result = await upsertArtistFromMusic8Json({
    admin,
    rawJson: music8Json,
    displayNameOverride: artistName || null,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    source: 'wp_rest',
    artistId: result.artistId,
    mode: result.mode === 'dry-run' ? 'update' : result.mode,
    patchKeys: Object.keys(result.patch),
    music8_artist_id: typeof music8Json.id === 'number' ? music8Json.id : null,
    slug: typeof music8Json.slug === 'string' ? music8Json.slug : music8Slug || null,
  });
}
