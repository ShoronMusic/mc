import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllSongRowsForArtistAggregation } from '@/lib/library-artist-count-rows';
import { indexLetterForArtist, stripLeadingArticleForSort, compareDisplayTitleCaseInsensitive } from '@/lib/admin-library-index';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

export const dynamic = 'force-dynamic';

/** 部屋「ライブラリから選曲」用（認証不要・DB は admin クライアント）。管理 `/api/admin/library/artists` と同型。 */
export type LibraryArtistIndexItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

/**
 * GET: 曲マスタを `main_artist` で集計（洋楽寄せ・邦楽寄り行は除外）。
 */
export async function GET() {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'DB 設定が未完了です。' }, { status: 503 });
  }

  let rows: {
    main_artist: string | null;
    song_title: string | null;
    display_title: string | null;
  }[];
  try {
    rows = await fetchAllSongRowsForArtistAggregation(admin);
  } catch (e) {
    console.error('[api/library/artists]', e);
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '曲一覧の取得に失敗しました。';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (songRowLooksJapaneseDomesticForAdminLibrary(r)) continue;
    const a = (r.main_artist ?? '').trim();
    const key = a || '(表示なし)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const items: LibraryArtistIndexItem[] = Array.from(counts.entries())
    .filter(([, count]) => count > 0)
    .map(([main_artist, count]) => ({
      main_artist,
      count,
      indexLetter: indexLetterForArtist(main_artist === '(表示なし)' ? '' : main_artist),
    }));

  items.sort((x, y) =>
    compareDisplayTitleCaseInsensitive(
      stripLeadingArticleForSort(x.main_artist),
      stripLeadingArticleForSort(y.main_artist),
    ),
  );

  const letters = Array.from(new Set(items.map((i) => i.indexLetter))).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'en');
  });

  return NextResponse.json({ items, letters });
}
