import { NextResponse } from 'next/server';
import {
  fetchMusicLibraryArtistProfile,
  getMusicLibraryAdmin,
} from '@/lib/music-library-query';

export const dynamic = 'force-dynamic';

/**
 * GET: Music Library 右カラム用のアーティスト概要。
 * Query: slug または name
 */
export async function GET(request: Request) {
  const admin = getMusicLibraryAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const slug = (searchParams.get('slug') ?? '').trim();
  const name = (searchParams.get('name') ?? '').trim();
  if (!slug && !name) {
    return NextResponse.json({ error: 'slug or name is required' }, { status: 400 });
  }
  try {
    const profile = await fetchMusicLibraryArtistProfile(admin, { slug, name });
    const res = NextResponse.json({ profile });
    res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (e) {
    console.error('[api/music/artist]', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
