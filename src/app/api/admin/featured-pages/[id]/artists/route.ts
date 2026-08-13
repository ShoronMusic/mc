import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeaturedPageStyle, parseFeaturedPageStyle } from '@/lib/featured-page-styles';
import {
  isFeaturedPageTableMissingError,
  mapFeaturedPageArtistRow,
  normalizeArtistNameKey,
  normalizeFeaturedLabelNote,
} from '@/lib/featured-pages';
import { SUMMER_SONIC_2026_LINEUP } from '@/config/featured-page-summer-sonic-2026';

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

type ArtistInput = {
  artist_name: string;
  style: string;
  sort_order?: number;
  artist_id?: string | null;
  label_note?: string | null;
};

function parseArtistInputs(raw: unknown): ArtistInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ArtistInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== 'object') continue;
    const artist_name =
      typeof (row as { artist_name?: unknown }).artist_name === 'string'
        ? (row as { artist_name: string }).artist_name.trim()
        : '';
    if (!artist_name) continue;
    const key = normalizeArtistNameKey(artist_name);
    if (seen.has(key)) continue;
    seen.add(key);
    const style =
      parseFeaturedPageStyle((row as { style?: unknown }).style) ??
      (isFeaturedPageStyle((row as { style?: unknown }).style)
        ? ((row as { style: string }).style as ArtistInput['style'])
        : null);
    if (!style) continue;
    const sort_order =
      typeof (row as { sort_order?: unknown }).sort_order === 'number'
        ? Math.floor((row as { sort_order: number }).sort_order)
        : i;
    const artist_id =
      typeof (row as { artist_id?: unknown }).artist_id === 'string'
        ? (row as { artist_id: string }).artist_id.trim() || null
        : null;
    const label_note = normalizeFeaturedLabelNote((row as { label_note?: unknown }).label_note);
    out.push({ artist_name, style, sort_order, artist_id, label_note });
  }
  return out;
}

/** PUT: アーティスト一覧を全置換。body.artists または body.seed = 'summer-sonic-2026' */
export async function PUT(request: Request, ctx: Ctx) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const id = ctx.params.id?.trim();
  if (!id) return NextResponse.json({ error: 'id が必要です。' }, { status: 400 });

  const { data: page, error: pageErr } = await admin
    .from('featured_pages')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (pageErr) {
    if (isFeaturedPageTableMissingError(pageErr.message)) return tableMissingResponse();
    return NextResponse.json({ error: '特集の確認に失敗しました。' }, { status: 500 });
  }
  if (!page) {
    return NextResponse.json({ error: '特集が見つかりません。' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  let inputs: ArtistInput[] | null = null;
  if (body?.seed === 'summer-sonic-2026') {
    inputs = SUMMER_SONIC_2026_LINEUP.map((row, i) => ({
      artist_name: row.artist_name,
      style: row.style,
      sort_order: i,
    }));
  } else {
    inputs = parseArtistInputs(body?.artists);
  }
  if (!inputs) {
    return NextResponse.json({ error: 'artists 配列が必要です。' }, { status: 400 });
  }

  const { error: delErr } = await admin.from('featured_page_artists').delete().eq('featured_page_id', id);
  if (delErr) {
    console.error('[admin/featured-pages artists] delete', delErr.message);
    return NextResponse.json({ error: '既存アーティストの削除に失敗しました。' }, { status: 500 });
  }

  if (inputs.length > 0) {
    const rows = inputs.map((a, i) => ({
      featured_page_id: id,
      artist_name: a.artist_name,
      style: a.style,
      sort_order: a.sort_order ?? i,
      artist_id: a.artist_id ?? null,
      label_note: a.label_note ?? null,
    }));
    const { error: insErr } = await admin.from('featured_page_artists').insert(rows);
    if (insErr) {
      console.error('[admin/featured-pages artists] insert', insErr.message);
      return NextResponse.json({ error: 'アーティストの保存に失敗しました。' }, { status: 500 });
    }
  }

  await admin
    .from('featured_pages')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);

  const { data: artistsRaw, error: artErr } = await admin
    .from('featured_page_artists')
    .select('*')
    .eq('featured_page_id', id)
    .order('sort_order', { ascending: true });
  if (artErr) {
    return NextResponse.json({ error: '保存後の一覧取得に失敗しました。' }, { status: 500 });
  }
  const artists = (artistsRaw ?? [])
    .map((row) => mapFeaturedPageArtistRow(row as Record<string, unknown>))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return NextResponse.json({ artists });
}
