import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createGenreBestPlaylist,
  listGenreBestPlaylists,
} from '@/lib/catalog-genre-best';

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

/** GET: Genre BEST 一覧 */
export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { items, error, tableMissing } = await listGenreBestPlaylists(admin);
  if (tableMissing) return tableMissingResponse();
  if (error) {
    console.error('[admin/genre-best] GET', error);
    return NextResponse.json({ error: 'Genre BEST 一覧の取得に失敗しました。' }, { status: 500 });
  }

  return NextResponse.json({ items, total: items.length });
}

/** POST: 手動新規 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : undefined;
  const description =
    typeof body?.description === 'string' ? body.description.trim() : undefined;

  const { item, error, tableMissing } = await createGenreBestPlaylist(admin, {
    title,
    slug,
    description,
  });
  if (tableMissing) return tableMissingResponse();
  if (error || !item) {
    return NextResponse.json({ error: error || '作成に失敗しました。' }, { status: 400 });
  }

  return NextResponse.json({ item });
}
