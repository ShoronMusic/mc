import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupFeaturedArtistsByStyle } from '@/lib/featured-page-styles';
import {
  isFeaturedPageTableMissingError,
  mapFeaturedPageArtistRow,
  mapFeaturedPageRow,
} from '@/lib/featured-pages';

export const dynamic = 'force-dynamic';

/**
 * GET: 公開中の特集一覧（部屋チャット用）。
 * `?id=` または `?slug=` で1件＋アーティスト。
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const sp = new URL(request.url).searchParams;
  const id = (sp.get('id') ?? '').trim();
  const slug = (sp.get('slug') ?? '').trim();

  if (id || slug) {
    let q = admin.from('featured_pages').select('*').eq('published', true);
    q = id ? q.eq('id', id) : q.eq('slug', slug);
    const { data: page, error } = await q.maybeSingle();
    if (error) {
      if (isFeaturedPageTableMissingError(error.message)) {
        return NextResponse.json({ items: [], item: null });
      }
      console.error('[featured-pages] GET one', error.message);
      return NextResponse.json({ error: '特集の取得に失敗しました。' }, { status: 500 });
    }
    const mapped = page ? mapFeaturedPageRow(page as Record<string, unknown>) : null;
    if (!mapped) {
      return NextResponse.json({ item: null }, { status: 404 });
    }
    const { data: artistsRaw, error: artErr } = await admin
      .from('featured_page_artists')
      .select('*')
      .eq('featured_page_id', mapped.id)
      .order('sort_order', { ascending: true });
    if (artErr) {
      return NextResponse.json({ error: 'アーティスト一覧の取得に失敗しました。' }, { status: 500 });
    }
    const artists = (artistsRaw ?? [])
      .map((row) => mapFeaturedPageArtistRow(row as Record<string, unknown>))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    const groups = groupFeaturedArtistsByStyle(artists);
    return NextResponse.json({
      item: {
        id: mapped.id,
        title: mapped.title,
        slug: mapped.slug,
        description: mapped.description,
        ai_usage_free: mapped.ai_usage_free,
        artists,
        groups: groups.map((g) => ({
          style: g.style,
          artists: g.artists.map((a) => ({
            id: a.id,
            artist_name: a.artist_name,
            style: a.style,
            label_note: a.label_note,
            sort_order: a.sort_order,
          })),
        })),
      },
    });
  }

  const { data, error } = await admin
    .from('featured_pages')
    .select('id, title, slug, description, ai_usage_free, sort_order')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    if (isFeaturedPageTableMissingError(error.message)) {
      return NextResponse.json({ items: [] });
    }
    console.error('[featured-pages] GET list', error.message);
    return NextResponse.json({ error: '特集一覧の取得に失敗しました。' }, { status: 500 });
  }

  const items = (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    title: String((row as { title: string }).title ?? ''),
    slug: String((row as { slug: string }).slug ?? ''),
    description:
      typeof (row as { description?: string | null }).description === 'string'
        ? (row as { description: string }).description
        : null,
    ai_usage_free: (row as { ai_usage_free?: boolean }).ai_usage_free === true,
    sort_order: Number((row as { sort_order?: number }).sort_order) || 0,
  }));

  return NextResponse.json({ items });
}
