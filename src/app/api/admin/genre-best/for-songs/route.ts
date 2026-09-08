import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGenreBestLabelsForSongs } from '@/lib/catalog-genre-best';

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

/** GET: 曲 ID 群に紐づく Genre BEST ラベル */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const url = new URL(request.url);
  const idsRaw = url.searchParams.get('ids') ?? '';
  const ids = idsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500);

  const { bySongId, error, tableMissing } = await getGenreBestLabelsForSongs(admin, ids);
  if (tableMissing) return tableMissingResponse();
  if (error) {
    console.error('[admin/genre-best/for-songs]', error);
    return NextResponse.json({ error: 'ラベルの取得に失敗しました。' }, { status: 500 });
  }

  return NextResponse.json({ bySongId });
}
