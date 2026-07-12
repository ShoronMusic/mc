import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getLibraryArtistIndexCached,
  type LibraryArtistIndexItem,
} from '@/lib/build-library-artist-index';
import { mergeLibraryArtistIndexItems } from '@/lib/library-search-query';
import {
  defaultLibraryCatalogFilter,
  parseLibraryCatalogFilter,
} from '@/lib/song-catalog-scope';

export const dynamic = 'force-dynamic';

export type { LibraryArtistIndexItem };

/**
 * GET: 曲マスタを `main_artist` で集計（`?catalog=western|domestic|all`）。
 * 集計結果はサーバー内で最大15分キャッシュ（索引クリックの体感改善）。
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  const catalog = parseLibraryCatalogFilter(
    new URL(request.url).searchParams.get('catalog'),
    defaultLibraryCatalogFilter(),
  );

  try {
    const { items, letters } = await getLibraryArtistIndexCached(admin, catalog);
    const mergedItems = mergeLibraryArtistIndexItems(items);
    const res = NextResponse.json({ items: mergedItems, letters, catalog });
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (e) {
    console.error('[api/library/artists]', e);
    const msg =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : '曲一覧の取得に失敗しました。';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
