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
import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';
import { primaryArtistForLibraryIndex } from '@/lib/library-search-query';

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

let indexCache: { builtAt: number; payload: LibraryArtistIndexPayload } | null = null;

export function clearLibraryArtistIndexCache(): void {
  indexCache = null;
}

function artistIndexKey(name: string): string {
  return name.trim().toLowerCase();
}

function mergeArtistDisplayName(existing: string, candidate: string): string {
  const c = candidate.trim();
  if (!existing) return c;
  if (existing.includes(',') && !c.includes(',')) return c;
  return existing;
}

/** `songs` 全行を走査してアーティスト索引を構築（邦楽寄り除外あり） */
export async function buildLibraryArtistIndex(
  client: SupabaseClient,
): Promise<LibraryArtistIndexPayload> {
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

  const rows = await fetchAllSongRowsForArtistAggregation(client);
  for (const r of rows) {
    if (songRowLooksJapaneseDomesticForAdminLibrary(r)) continue;
    registerSong(r.main_artist ?? '', r.id);
  }

  try {
    const creditRows = await fetchAllSongCreditRowsForArtistAggregation(client);
    for (const r of creditRows) {
      if (
        songRowLooksJapaneseDomesticForAdminLibrary({
          main_artist: r.main_artist,
          song_title: r.song_title,
          display_title: r.display_title,
        })
      ) {
        continue;
      }
      registerSong(r.artist_name, r.song_id);
    }
  } catch (e) {
    console.warn('[buildLibraryArtistIndex] song_credits skipped', e);
  }

  const counts = new Map<string, number>();
  for (const [, bucket] of songIdsByArtist) {
    counts.set(bucket.display, bucket.songIds.size);
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
