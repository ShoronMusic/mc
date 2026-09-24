import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  CATALOG_GENRE_SELECT,
  CATALOG_GENRE_SELECT_WITH_COUNT,
  CATALOG_GENRE_TABLE_HINT,
  isCatalogGenreId,
  isCatalogGenreTableMissingError,
  mapCatalogGenreRow,
  parseCatalogGenreWriteBody,
} from '@/lib/catalog-genres';
import { clearMusicLibraryGenreIndexCache } from '@/lib/music-library-genre-index';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

function tableMissingResponse() {
  return NextResponse.json(
    {
      error: 'catalog_genres テーブルがありません。',
      hint: CATALOG_GENRE_TABLE_HINT,
    },
    { status: 503 },
  );
}

async function loadGenre(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
) {
  const withCount = await admin
    .from('catalog_genres')
    .select(CATALOG_GENRE_SELECT_WITH_COUNT)
    .eq('id', id)
    .maybeSingle();
  if (withCount.error) {
    if (
      isCatalogGenreTableMissingError(withCount.error.message) ||
      withCount.error.code === '42P01'
    ) {
      return { ok: false as const, response: tableMissingResponse() };
    }
    const fallback = await admin
      .from('catalog_genres')
      .select(CATALOG_GENRE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (fallback.error) {
      console.error('[admin/catalog-genres/[id]] GET', fallback.error.message);
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'ジャンルの取得に失敗しました。' }, { status: 500 }),
      };
    }
    const item = fallback.data
      ? mapCatalogGenreRow(fallback.data as unknown as Record<string, unknown>)
      : null;
    if (!item) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'ジャンルが見つかりません。' }, { status: 404 }),
      };
    }
    return { ok: true as const, item };
  }

  const item = withCount.data
    ? mapCatalogGenreRow(withCount.data as unknown as Record<string, unknown>)
    : null;
  if (!item) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'ジャンルが見つかりません。' }, { status: 404 }),
    };
  }
  return { ok: true as const, item };
}

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const id = ctx.params.id?.trim() ?? '';
  if (!isCatalogGenreId(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }

  const loaded = await loadGenre(admin, id);
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

  const id = ctx.params.id?.trim() ?? '';
  if (!isCatalogGenreId(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }

  const parsed = parseCatalogGenreWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { error } = await admin
    .from('catalog_genres')
    .update({
      name: parsed.value.name,
      slug: parsed.value.slug,
      name_ja: parsed.value.name_ja,
      description_ja: parsed.value.description_ja,
      parent_genre: parsed.value.parent_genre,
      wp_term_id: parsed.value.wp_term_id,
    })
    .eq('id', id);

  if (error) {
    if (isCatalogGenreTableMissingError(error.message) || error.code === '42P01') {
      return tableMissingResponse();
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '同じ slug または WP term ID のジャンルが既にあります。' },
        { status: 409 },
      );
    }
    console.error('[admin/catalog-genres/[id]] PATCH', error.message);
    return NextResponse.json({ error: 'ジャンルの更新に失敗しました。' }, { status: 500 });
  }

  const loaded = await loadGenre(admin, id);
  if (!loaded.ok) return loaded.response;
  clearMusicLibraryGenreIndexCache();
  return NextResponse.json({ item: loaded.item });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const id = ctx.params.id?.trim() ?? '';
  if (!isCatalogGenreId(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('catalog_genres')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (isCatalogGenreTableMissingError(error.message) || error.code === '42P01') {
      return tableMissingResponse();
    }
    console.error('[admin/catalog-genres/[id]] DELETE', error.message);
    return NextResponse.json({ error: 'ジャンルの削除に失敗しました。' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'ジャンルが見つかりません。' }, { status: 404 });
  }

  clearMusicLibraryGenreIndexCache();
  return NextResponse.json({ ok: true, id });
}
