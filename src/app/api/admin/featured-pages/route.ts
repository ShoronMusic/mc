import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isFeaturedPageTableMissingError,
  mapFeaturedPageRow,
  slugifyFeaturedPageTitle,
} from '@/lib/featured-pages';

export const dynamic = 'force-dynamic';

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        '特集ページのテーブルが未作成です。docs/supabase-featured-pages-tables.md の SQL を実行してください。',
    },
    { status: 503 },
  );
}

/** GET: 特集一覧 */
export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { data, error } = await admin
    .from('featured_pages')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) return tableMissingResponse();
    console.error('[admin/featured-pages] GET', error.message);
    return NextResponse.json({ error: '特集一覧の取得に失敗しました。' }, { status: 500 });
  }

  const items = (data ?? [])
    .map((row) => mapFeaturedPageRow(row as Record<string, unknown>))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return NextResponse.json({ items });
}

/** POST: 新規特集 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'タイトルが必要です。' }, { status: 400 });
  }
  const slugRaw = typeof body?.slug === 'string' ? body.slug.trim() : '';
  const slug = slugRaw || slugifyFeaturedPageTitle(title);
  const description =
    typeof body?.description === 'string' ? body.description.trim() || null : null;
  const published = body?.published === true;
  const ai_usage_free = body?.ai_usage_free === true;
  const sort_order =
    typeof body?.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.floor(body.sort_order)
      : 0;

  const { data, error } = await admin
    .from('featured_pages')
    .insert({
      title,
      slug,
      description,
      published,
      ai_usage_free,
      sort_order,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) return tableMissingResponse();
    if (error.code === '23505') {
      return NextResponse.json({ error: '同じ slug の特集が既にあります。' }, { status: 409 });
    }
    console.error('[admin/featured-pages] POST', error.message);
    return NextResponse.json({ error: '特集の作成に失敗しました。' }, { status: 500 });
  }

  const item = mapFeaturedPageRow(data as Record<string, unknown>);
  return NextResponse.json({ item }, { status: 201 });
}
