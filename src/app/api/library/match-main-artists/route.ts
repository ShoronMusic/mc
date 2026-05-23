import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { expandLibrarySearchQueryVariants, resolveMainArtistsForLibrarySearch } from '@/lib/library-search-query';

export const dynamic = 'force-dynamic';

/**
 * GET: 日本語名・表記ゆれから `songs.main_artist`（英語表記）候補を返す（索引の部分一致用）
 * Query: q（必須）
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ main_artists: [] as string[], variants: [] as string[] });
  }

  const variants = expandLibrarySearchQueryVariants(q);
  const main_artists = await resolveMainArtistsForLibrarySearch(admin, q);

  return NextResponse.json({ main_artists, variants });
}
