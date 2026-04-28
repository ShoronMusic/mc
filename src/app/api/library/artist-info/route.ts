import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const { data, error } = await admin.from('artists').select('*').ilike('name', artist).limit(50);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ artist: null as ArtistInfo | null });
    console.error('[api/library/artist-info] artists', error);
    return NextResponse.json({ error: 'アーティスト情報の取得に失敗しました。' }, { status: 500 });
  }

  const rows = (data ?? []) as ArtistInfo[];
  const q = normalizeArtistNameLoose(artist);
  const picked =
    rows.find((r) => normalizeArtistNameLoose(r.name ?? '') === q) ??
    rows.find((r) => typeof r.name === 'string' && r.name.toLowerCase() === artist.toLowerCase()) ??
    rows[0] ??
    null;

  return NextResponse.json({ artist: picked });
}

