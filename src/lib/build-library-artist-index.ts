import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllSongRowsForArtistAggregation } from '@/lib/library-artist-count-rows';
import {
  compareDisplayTitleCaseInsensitive,
  indexLetterForArtist,
  stripLeadingArticleForSort,
} from '@/lib/admin-library-index';
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';

export type LibraryArtistIndexItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

export type LibraryArtistIndexPayload = {
  items: LibraryArtistIndexItem[];
  letters: string[];
};

const INDEX_CACHE_TTL_MS = 15 * 60 * 1000;

let indexCache: { builtAt: number; payload: LibraryArtistIndexPayload } | null = null;

export function clearLibraryArtistIndexCache(): void {
  indexCache = null;
}

/** `songs` 全行を走査してアーティスト索引を構築（邦楽寄り除外あり） */
export async function buildLibraryArtistIndex(
  client: SupabaseClient,
): Promise<LibraryArtistIndexPayload> {
  const rows = await fetchAllSongRowsForArtistAggregation(client);
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

  return { items, letters };
}

/** 部屋ライブラリ用: プロセス内メモリキャッシュ（全曲走査の頻度を下げる） */
export async function getLibraryArtistIndexCached(
  client: SupabaseClient,
): Promise<LibraryArtistIndexPayload> {
  const now = Date.now();
  if (indexCache && now - indexCache.builtAt < INDEX_CACHE_TTL_MS) {
    return indexCache.payload;
  }
  const payload = await buildLibraryArtistIndex(client);
  indexCache = { builtAt: now, payload };
  return payload;
}
