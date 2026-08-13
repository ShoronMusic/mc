import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isFeaturedPageTableMissingError,
  mapFeaturedPageArtistRow,
  mapFeaturedPageRow,
  slugifyFeaturedPageTitle,
  type FeaturedPageWithArtists,
} from '@/lib/featured-pages';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        '特集ページのテーブルが未作成です。docs/supabase-featured-pages-tables.md の SQL を実行してください。',
    },
    { status: 503 },
  );
}

async function loadPageWithArtists(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
): Promise<
  | { ok: true; item: FeaturedPageWithArtists }
  | { ok: false; response: NextResponse }
> {
  const { data: page, error } = await admin.from('featured_pages').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) return { ok: false, response: tableMissingResponse() };
    return {
      ok: false,
      response: NextResponse.json({ error: '特集の取得に失敗しました。' }, { status: 500 }),
    };
  }
  const mapped = page ? mapFeaturedPageRow(page as Record<string, unknown>) : null;
  if (!mapped) {
    return { ok: false, response: NextResponse.json({ error: '特集が見つかりません。' }, { status: 404 }) };
  }

  const { data: artistsRaw, error: artErr } = await admin
    .from('featured_page_artists')
    .select('*')
    .eq('featured_page_id', id)
    .order('sort_order', { ascending: true });
  if (artErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'アーティスト一覧の取得に失敗しました。' }, { status: 500 }),
    };
  }
  const artists = (artistsRaw ?? [])
    .map((row) => mapFeaturedPageArtistRow(row as Record<string, unknown>))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return { ok: true, item: { ...mapped, artists } };
}

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const id = ctx.params.id?.trim();
  if (!id) return NextResponse.json({ error: 'id が必要です。' }, { status: 400 });

  const loaded = await loadPageWithArtists(admin, id);
  if (!loaded.ok) return loaded.response;
  return NextResponse.json({ item: loaded.item });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const id = ctx.params.id?.trim();
  if (!id) return NextResponse.json({ error: 'id が必要です。' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.title === 'string') {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'タイトルが空です。' }, { status: 400 });
    patch.title = title;
  }
  if (typeof body?.slug === 'string') {
    const slug = body.slug.trim() || slugifyFeaturedPageTitle(String(patch.title ?? ''));
    if (!slug) return NextResponse.json({ error: 'slug が空です。' }, { status: 400 });
    patch.slug = slug;
  }
  if (typeof body?.description === 'string') {
    patch.description = body.description.trim() || null;
  } else if (body?.description === null) {
    patch.description = null;
  }
  if (typeof body?.published === 'boolean') patch.published = body.published;
  if (typeof body?.ai_usage_free === 'boolean') patch.ai_usage_free = body.ai_usage_free;
  if (typeof body?.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    patch.sort_order = Math.floor(body.sort_order);
  }

  const { error } = await admin.from('featured_pages').update(patch).eq('id', id);
  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) return tableMissingResponse();
    if (error.code === '23505') {
      return NextResponse.json({ error: '同じ slug の特集が既にあります。' }, { status: 409 });
    }
    console.error('[admin/featured-pages/[id]] PATCH', error.message);
    return NextResponse.json({ error: '特集の更新に失敗しました。' }, { status: 500 });
  }

  const loaded = await loadPageWithArtists(admin, id);
  if (!loaded.ok) return loaded.response;
  return NextResponse.json({ item: loaded.item });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const id = ctx.params.id?.trim();
  if (!id) return NextResponse.json({ error: 'id が必要です。' }, { status: 400 });

  const { error } = await admin.from('featured_pages').delete().eq('id', id);
  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) return tableMissingResponse();
    console.error('[admin/featured-pages/[id]] DELETE', error.message);
    return NextResponse.json({ error: '特集の削除に失敗しました。' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
