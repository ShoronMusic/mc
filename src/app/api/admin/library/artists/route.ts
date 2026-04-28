import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { indexLetterForArtist, stripLeadingArticleForSort, compareDisplayTitleCaseInsensitive } from '@/lib/admin-library-index';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

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

  const { data, error } = await supabase.from('songs').select('main_artist, song_title, display_title');

  if (error) {
    console.error('[admin/library/artists]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    main_artist: string | null;
    song_title: string | null;
    display_title: string | null;
  }[];
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (songRowLooksJapaneseDomesticForAdminLibrary(r)) continue;
    const a = (r.main_artist ?? '').trim();
    const key = a || '(表示なし)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const items: AdminLibraryArtistItem[] = Array.from(counts.entries())
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
