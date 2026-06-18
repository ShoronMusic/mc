import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { artistNameToMusic8Slug, type Music8ArtistJson } from '@/lib/music8-artist-display';
import { fetchMusic8ArtistJsonByName } from '@/lib/music8-artist-json-by-name-server';

export const dynamic = 'force-dynamic';

type ArtistInfo = {
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
 * GET: ライブラリ表示用のアーティスト基本情報（artists テーブル）を返す
 * Query: artist（必須）
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get('artist') ?? '').trim();
  if (!artist) {
    return NextResponse.json({ error: 'artist query is required' }, { status: 400 });
  }

  const slug = artistNameToMusic8Slug(artist);
  const rows: ArtistInfo[] = [];
  const seen = new Set<string>();
  const appendRows = (list: ArtistInfo[] | null | undefined) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
  };

  if (slug) {
    const { data: bySlug, error: slugErr } = await admin
      .from('artists')
      .select('*')
      .eq('music8_artist_slug', slug)
      .limit(50);
    if (slugErr && slugErr.code !== '42P01') {
      console.error('[api/library/artist-info] artists by slug', slugErr);
      return NextResponse.json({ error: 'アーティスト情報の取得に失敗しました。' }, { status: 500 });
    }
    appendRows((bySlug ?? []) as ArtistInfo[]);
  }

  const { data: byName, error } = await admin.from('artists').select('*').ilike('name', artist).limit(50);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ artist: null as ArtistInfo | null });
    console.error('[api/library/artist-info] artists', error);
    return NextResponse.json({ error: 'アーティスト情報の取得に失敗しました。' }, { status: 500 });
  }
  appendRows((byName ?? []) as ArtistInfo[]);

  if (rows.length === 0) {
    const escaped = artist.replace(/[%_]/g, '\\$&');
    const { data: byNameLike, error: likeErr } = await admin
      .from('artists')
      .select('*')
      .ilike('name', `%${escaped}%`)
      .limit(100);
    if (likeErr && likeErr.code !== '42P01') {
      console.error('[api/library/artist-info] artists by name like', likeErr);
      return NextResponse.json({ error: 'アーティスト情報の取得に失敗しました。' }, { status: 500 });
    }
    appendRows((byNameLike ?? []) as ArtistInfo[]);
  }

  const q = normalizeArtistNameLoose(artist);
  const picked =
    rows.find((r) => normalizeArtistNameLoose(r.name ?? '') === q) ??
    rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === artist.toLowerCase()) ??
    rows[0] ??
    null;

  let music8: Music8ArtistJson | null = null;
  try {
    music8 = await fetchMusic8ArtistJsonByName(artist);
  } catch (e) {
    console.warn('[api/library/artist-info] music8 fetch skipped', e);
  }

  return NextResponse.json({ artist: picked, music8 });
}
