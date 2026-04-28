import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type ArtistInfoRow = {
  id: string;
  name: string;
  name_ja: string | null;
  music8_artist_slug: string | null;
  kind: string | null;
  origin_country: string | null;
  active_period: string | null;
  members: string | null;
  youtube_channel_title: string | null;
  youtube_channel_url: string | null;
  image_url: string | null;
  image_credit: string | null;
  profile_text: string | null;
};

function normalizeArtistNameLoose(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

/**
 * GET: 管理ライブラリ用アーティスト基本情報
 * Query: artist（必須）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }
  const supabase = admin;

  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get('artist') ?? '').trim();
  if (!artist) {
    return NextResponse.json({ error: 'artist query is required' }, { status: 400 });
  }

  const slug = artistNameToMusic8Slug(artist);
  const rows: ArtistInfoRow[] = [];
  const seen = new Set<string>();
  const appendRows = (list: ArtistInfoRow[] | null | undefined) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  };

  if (slug) {
    const { data: bySlug, error: slugErr } = await supabase
      .from('artists')
      .select('*')
      .eq('music8_artist_slug', slug)
      .limit(50);
    if (slugErr && slugErr.code !== '42P01') {
      console.error('[api/admin/library/artist-info] artists by slug', slugErr);
      return NextResponse.json({ error: slugErr.message }, { status: 500 });
    }
    appendRows((bySlug ?? []) as ArtistInfoRow[]);
  }

  const { data: byName, error: nameErr } = await supabase
    .from('artists')
    .select('*')
    .ilike('name', artist)
    .limit(50);
  if (nameErr && nameErr.code !== '42P01') {
    console.error('[api/admin/library/artist-info] artists by name', nameErr);
    return NextResponse.json({ error: nameErr.message }, { status: 500 });
  }
  appendRows((byName ?? []) as ArtistInfoRow[]);

  if (rows.length === 0) {
    const escaped = artist.replace(/[%_]/g, '\\$&');
    const { data: byNameLike, error: likeErr } = await supabase
      .from('artists')
      .select('*')
      .ilike('name', `%${escaped}%`)
      .limit(100);
    if (likeErr && likeErr.code !== '42P01') {
      console.error('[api/admin/library/artist-info] artists by name like', likeErr);
      return NextResponse.json({ error: likeErr.message }, { status: 500 });
    }
    appendRows((byNameLike ?? []) as ArtistInfoRow[]);
  }

  const q = normalizeArtistNameLoose(artist);
  const picked =
    rows.find((r) => normalizeArtistNameLoose(r.name ?? '') === q) ??
    rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === artist.toLowerCase()) ??
    rows[0] ??
    null;

  return NextResponse.json({ artist: picked });
}

