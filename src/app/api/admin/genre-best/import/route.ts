import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { importGenreBestPlaylistsFromWp } from '@/lib/catalog-genre-best-import';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        'Genre BEST テーブルが未作成です。docs/sql/music8-catalog-extension.sql と docs/sql/catalog-playlists-cover-image.sql を実行してください。',
    },
    { status: 503 },
  );
}

/** POST: WP から Genre BEST（プレイリスト）を一括取込 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const apply = body?.apply !== false;
  const limitRaw = body?.limit;
  const limit =
    typeof limitRaw === 'number' && Number.isFinite(limitRaw)
      ? Math.floor(limitRaw)
      : typeof limitRaw === 'string' && limitRaw.trim()
        ? Number(limitRaw)
        : null;

  const result = await importGenreBestPlaylistsFromWp(admin, {
    apply,
    limit: Number.isFinite(limit as number) && (limit as number) > 0 ? (limit as number) : null,
  });

  if (result.tableMissing) return tableMissingResponse();

  return NextResponse.json(result, { status: result.ok || result.dryRun ? 200 : 502 });
}
