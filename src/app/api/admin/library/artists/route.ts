import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { buildLibraryArtistIndex } from '@/lib/build-library-artist-index';

export const dynamic = 'force-dynamic';

export type AdminLibraryArtistItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

/**
 * GET: 曲マスタ `songs` を `main_artist` で集計（管理ライブラリ用）。
 * 邦楽寄り行（主要メタに日本語等・英字主体洋楽例外外）は集計から除外。
 */
export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { items, letters } = await buildLibraryArtistIndex(supabase);
    return NextResponse.json({ items, letters });
  } catch (e) {
    console.error('[admin/library/artists]', e);
    const msg =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : '曲一覧の取得に失敗しました。';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
