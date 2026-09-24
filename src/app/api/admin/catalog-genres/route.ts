import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  CATALOG_GENRE_SELECT,
  CATALOG_GENRE_SELECT_WITH_COUNT,
  CATALOG_GENRE_TABLE_HINT,
  isCatalogGenreTableMissingError,
  mapCatalogGenreRow,
  parseCatalogGenreWriteBody,
  type CatalogGenreRow,
} from '@/lib/catalog-genres';
import { clearMusicLibraryGenreIndexCache } from '@/lib/music-library-genre-index';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

function tableMissingResponse() {
  return NextResponse.json(
    {
      error: 'catalog_genres テーブルがありません。',
      hint: CATALOG_GENRE_TABLE_HINT,
      items: [],
    },
    { status: 503 },
  );
}

async function fetchAllCatalogGenreRows(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<{ items: CatalogGenreRow[] } | { error: NextResponse }> {
  const items: CatalogGenreRow[] = [];
  let select = CATALOG_GENRE_SELECT_WITH_COUNT;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('catalog_genres')
      .select(select)
      .order('name', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (isCatalogGenreTableMissingError(error.message) || error.code === '42P01') {
        return { error: tableMissingResponse() };
      }
      if (select === CATALOG_GENRE_SELECT_WITH_COUNT && offset === 0) {
        select = CATALOG_GENRE_SELECT;
        offset = -PAGE;
        continue;
      }
      console.error('[admin/catalog-genres] GET', error.message);
      return {
        error: NextResponse.json({ error: 'ジャンル一覧の取得に失敗しました。' }, { status: 500 }),
      };
    }
    const batch = ((data ?? []) as unknown) as Record<string, unknown>[];
    for (const row of batch) {
      const mapped = mapCatalogGenreRow(row);
      if (mapped) items.push(mapped);
    }
    if (batch.length < PAGE) break;
  }
  return { items };
}

export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const loaded = await fetchAllCatalogGenreRows(admin);
  if ('error' in loaded) return loaded.error;
  return NextResponse.json({ items: loaded.items });
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }

  const parsed = parseCatalogGenreWriteBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await admin
    .from('catalog_genres')
    .insert({
      name: parsed.value.name,
      slug: parsed.value.slug,
      name_ja: parsed.value.name_ja,
      description_ja: parsed.value.description_ja,
      parent_genre: parsed.value.parent_genre,
      wp_term_id: parsed.value.wp_term_id,
    })
    .select(CATALOG_GENRE_SELECT)
    .maybeSingle();

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
    console.error('[admin/catalog-genres] POST', error.message);
    return NextResponse.json({ error: 'ジャンルの作成に失敗しました。' }, { status: 500 });
  }

  const item = data ? mapCatalogGenreRow(data as unknown as Record<string, unknown>, 0) : null;
  if (!item) {
    return NextResponse.json({ error: '作成結果の読み取りに失敗しました。' }, { status: 500 });
  }

  clearMusicLibraryGenreIndexCache();
  return NextResponse.json({ item }, { status: 201 });
}
