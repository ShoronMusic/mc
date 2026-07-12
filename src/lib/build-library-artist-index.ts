import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAllSongCreditRowsForArtistAggregation,
  fetchAllSongRowsForArtistAggregation,
} from '@/lib/library-artist-count-rows';
import {
  compareDisplayTitleCaseInsensitive,
  indexLetterForArtist,
  stripLeadingArticleForSort,
} from '@/lib/admin-library-index';
import { primaryArtistForLibraryIndex, mergeLibraryArtistIndexItems } from '@/lib/library-search-query';
import {
  filterSongRowsByLibraryCatalog,
  type LibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

export type LibraryArtistIndexItem = {
  main_artist: string;
  count: number;
  indexLetter: string;
};

export type LibraryArtistIndexPayload = {
  items: LibraryArtistIndexItem[];
  letters: string[];
};

type ArtistIndexBucket = {
  display: string;
  songIds: Set<string>;
};

const INDEX_CACHE_TTL_MS = 15 * 60 * 1000;

const indexCache = new Map<
  LibraryCatalogFilter,
  { builtAt: number; payload: LibraryArtistIndexPayload }
>();

export function clearLibraryArtistIndexCache(): void {
  indexCache.clear();
}

function artistIndexKey(name: string): string {
  return stripLeadingArticleForSort(name).trim().toLowerCase();
}

function mergeArtistDisplayName(existing: string, candidate: string): string {
  const e = existing.trim();
  const c = candidate.trim();
  if (!e) return c;
  if (e.includes(',') && !c.includes(',')) return c;
  if (
    /^the\s+/i.test(c) &&
    !/^the\s+/i.test(e) &&
    artistIndexKey(e) === artistIndexKey(c)
  ) {
    return c;
  }
  return e;
}

/** `songs` 全行を走査してアーティスト索引を構築（`catalog` で洋楽 / 邦楽 / すべて） */
export async function buildLibraryArtistIndex(
  client: SupabaseClient,
  catalog: LibraryCatalogFilter = 'western',
): Promise<LibraryArtistIndexPayload> {
  await ensureWesternTreatedJpArtistCache();
  const songIdsByArtist = new Map<string, ArtistIndexBucket>();
  const registerSong = (artistLabel: string, songId: string) => {
    const primary = primaryArtistForLibraryIndex(artistLabel);
    const key = artistIndexKey(primary === '(表示なし)' ? '' : primary);
    if (!key) return;

    let bucket = songIdsByArtist.get(key);
    if (!bucket) {
      bucket = { display: primary, songIds: new Set() };
      songIdsByArtist.set(key, bucket);
    } else {
      bucket.display = mergeArtistDisplayName(bucket.display, primary);
    }
    bucket.songIds.add(songId);
  };

  const rows = filterSongRowsByLibraryCatalog(await fetchAllSongRowsForArtistAggregation(client), catalog);
  const catalogSongIds = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    registerSong(r.main_artist ?? '', r.id);
  }

  try {
    const creditRows = await fetchAllSongCreditRowsForArtistAggregation(client);
    for (const r of creditRows) {
      if (!catalogSongIds.has(r.song_id)) continue;
      registerSong(r.artist_name, r.song_id);
    }
  } catch (e) {
    console.warn('[buildLibraryArtistIndex] song_credits skipped', e);
  }

  const counts = new Map<string, number>();
  for (const [, bucket] of songIdsByArtist) {
    counts.set(bucket.display, bucket.songIds.size);
  }

  const items: LibraryArtistIndexItem[] = mergeLibraryArtistIndexItems(
    Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .map(([main_artist, count]) => ({
        main_artist,
        count,
        indexLetter: indexLetterForArtist(main_artist === '(表示なし)' ? '' : main_artist),
      })),
  );

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
  catalog: LibraryCatalogFilter = 'western',
): Promise<LibraryArtistIndexPayload> {
  const now = Date.now();
  const cached = indexCache.get(catalog);
  if (cached && now - cached.builtAt < INDEX_CACHE_TTL_MS) {
    return cached.payload;
  }
  const payload = await buildLibraryArtistIndex(client, catalog);
  indexCache.set(catalog, { builtAt: now, payload });
  return payload;
}
