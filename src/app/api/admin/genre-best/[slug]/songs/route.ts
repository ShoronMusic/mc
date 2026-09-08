import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { addSongToGenreBest, removeSongFromGenreBest } from '@/lib/catalog-genre-best';

export const dynamic = 'force-dynamic';

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        'Genre BEST テーブルが未作成です。docs/sql/music8-catalog-extension.sql と docs/sql/catalog-playlists-cover-image.sql を実行してください。',
    },
    { status: 503 },
  );
}

type RouteContext = { params: { slug: string } };

async function parseSongId(request: Request): Promise<string> {
  const body = await request.json().catch(() => ({}));
  if (typeof body?.songId === 'string') return body.songId.trim();
  if (typeof body?.song_id === 'string') return body.song_id.trim();
  return '';
}

/** POST: 曲を Genre BEST に追加 */
export async function POST(request: Request, context: RouteContext) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const slug = decodeURIComponent(context.params.slug ?? '').trim();
  const songId = await parseSongId(request);
  if (!songId) {
    return NextResponse.json({ error: 'songId が必要です。' }, { status: 400 });
  }

  const result = await addSongToGenreBest(admin, slug, songId);
  if (result.tableMissing) return tableMissingResponse();
  if (!result.ok) {
    return NextResponse.json({ error: result.error || '追加に失敗しました。' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, already: result.already === true });
}

/** DELETE: Genre BEST から曲を削除 */
export async function DELETE(request: Request, context: RouteContext) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const slug = decodeURIComponent(context.params.slug ?? '').trim();
  const songId = await parseSongId(request);
  if (!songId) {
    return NextResponse.json({ error: 'songId が必要です。' }, { status: 400 });
  }

  const result = await removeSongFromGenreBest(admin, slug, songId);
  if (result.tableMissing) return tableMissingResponse();
  if (!result.ok) {
    return NextResponse.json({ error: result.error || '削除に失敗しました。' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
