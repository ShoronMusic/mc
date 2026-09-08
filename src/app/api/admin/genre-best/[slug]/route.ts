import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGenreBestBySlug } from '@/lib/catalog-genre-best';

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

/** GET: Genre BEST 詳細＋曲 */
export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const slug = decodeURIComponent(context.params.slug ?? '').trim();
  const { detail, error, tableMissing } = await getGenreBestBySlug(admin, slug);
  if (tableMissing) return tableMissingResponse();
  if (error) {
    console.error('[admin/genre-best/slug] GET', error);
    return NextResponse.json({ error: '詳細の取得に失敗しました。' }, { status: 500 });
  }
  if (!detail) {
    return NextResponse.json({ error: 'Genre BEST が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json({ detail });
}
