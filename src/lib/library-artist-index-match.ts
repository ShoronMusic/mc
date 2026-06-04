import { stripLeadingArticleForSort } from '@/lib/admin-library-index';
import {
  expandMainArtistNamesForLibraryFilter,
  songMainArtistIncludesArtist,
} from '@/lib/library-search-query';

/** 先頭 The/A/An を除いた比較用キー（`music8-canonical-artist-name` は node:fs 依存のためクライアントから参照しない） */
function artistNameMatchKey(name: string): string {
  return stripLeadingArticleForSort(name).toLowerCase();
}

export type LibraryArtistIndexEntry = { main_artist: string };

/** Music8 / 再生行の表記からライブラリ索引照合用の候補名を集める */
export function collectLibraryLookupNames(
  ...names: (string | null | undefined)[]
): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const s = (raw ?? '').trim();
    if (!s) continue;
    for (const n of expandMainArtistNamesForLibraryFilter(s)) {
      out.add(n);
    }
  }
  return [...out];
}

/**
 * 公開ライブラリ索引（`/api/library/artists`）から、照合名に一致する `main_artist` を1件返す。
 */
export function findLibraryMainArtistInIndex(
  lookupNames: string[],
  items: LibraryArtistIndexEntry[],
): string | null {
  const lookups = collectLibraryLookupNames(...lookupNames);
  if (lookups.length === 0 || items.length === 0) return null;

  for (const item of items) {
    const ma = (item.main_artist ?? '').trim();
    if (!ma) continue;
    for (const q of lookups) {
      if (songMainArtistIncludesArtist(ma, q)) return ma;
    }
  }

  const keys = new Set(lookups.map(artistNameMatchKey).filter(Boolean));
  for (const item of items) {
    const ma = (item.main_artist ?? '').trim();
    if (!ma) continue;
    if (keys.has(artistNameMatchKey(ma))) return ma;
  }
  return null;
}
