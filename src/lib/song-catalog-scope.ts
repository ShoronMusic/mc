/**
 * 曲マスタの洋楽 / 邦楽スコープ（`songs.catalog_scope`）と、
 * 部屋ライブラリの `?catalog=` フィルタ共通ロジック。
 */

import { songRowLooksJapaneseDomesticForAdminLibrary } from '@/lib/admin-library-jp-exclude';
import { matchesDomesticJpArtist } from '@/lib/domestic-jp-artists';
import { isMcProduct } from '@/lib/product-mode';
import {
  librarySongRowMatchesWesternTreatedJpArtist,
  matchesWesternTreatedJpArtist,
} from '@/lib/western-treated-jp-artists';

export const SONG_CATALOG_SCOPES = ['western', 'domestic', 'unknown'] as const;
export type SongCatalogScope = (typeof SONG_CATALOG_SCOPES)[number];

export const LIBRARY_CATALOG_FILTERS = ['western', 'domestic', 'all'] as const;
export type LibraryCatalogFilter = (typeof LIBRARY_CATALOG_FILTERS)[number];

export function normalizeSongCatalogScope(raw: unknown): SongCatalogScope {
  if (raw === 'western' || raw === 'domestic') return raw;
  return 'unknown';
}

/** クエリ `catalog=` をパース。未指定時は `defaultFilter`（プロダクト既定）。 */
export function parseLibraryCatalogFilter(
  raw: string | null | undefined,
  defaultFilter?: LibraryCatalogFilter,
): LibraryCatalogFilter {
  const fallback = defaultFilter ?? defaultLibraryCatalogFilter();
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'domestic' || v === 'jp' || v === 'japanese') return 'domestic';
  if (v === 'all' || v === 'both') return 'all';
  if (v === 'western' || v === 'en' || v === 'international') return 'western';
  return fallback;
}

/** ma 既定 `western`、mc 既定 `all`。 */
export function defaultLibraryCatalogFilter(): LibraryCatalogFilter {
  return isMcProduct() ? 'all' : 'western';
}

export type SongRowForCatalogFilter = {
  catalog_scope?: string | null;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  primary_artist_name_ja?: string | null;
  music8_artist_slug?: string | null;
};

function artistOriginCountryLooksDomestic(origin: string | null | undefined): boolean {
  const o = (origin ?? '').trim().toUpperCase();
  return o === 'JP' || o === 'JPN' || o === 'JAPAN';
}

/** DB 列が無い／未設定行向けの推定（バックフィル・選曲 upsert 用）。 */
export function inferSongCatalogScopeFromSongRow(row: {
  main_artist?: string | null;
  song_title?: string | null;
  display_title?: string | null;
  artist_origin_country?: string | null;
}): SongCatalogScope {
  if (artistOriginCountryLooksDomestic(row.artist_origin_country)) return 'domestic';
  if (matchesDomesticJpArtist(row.main_artist, row.display_title, row.song_title)) {
    return 'domestic';
  }

  const adminRow = {
    main_artist: row.main_artist ?? null,
    song_title: row.song_title ?? null,
    display_title: row.display_title ?? null,
  };
  if (songRowLooksJapaneseDomesticForAdminLibrary(adminRow)) return 'domestic';

  const blob = [
    adminRow.display_title,
    adminRow.main_artist,
    adminRow.song_title,
  ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join(' ');
  if (/[A-Za-z]/.test(blob)) return 'western';

  return 'unknown';
}

/** 選曲時メタから `catalog_scope` を決める（MusicBrainz 邦楽判定等を取り込める）。 */
export function resolveSongCatalogScope(input: {
  mainArtist?: string | null;
  songTitle?: string | null;
  displayTitle?: string | null;
  artistOriginCountry?: string | null;
  isJapaneseEconomy?: boolean;
}): SongCatalogScope {
  if (matchesWesternTreatedJpArtist(input.mainArtist)) return 'western';
  if (
    matchesDomesticJpArtist(input.mainArtist, input.displayTitle, input.songTitle)
  ) {
    return 'domestic';
  }
  if (input.isJapaneseEconomy) return 'domestic';
  return inferSongCatalogScopeFromSongRow({
    main_artist: input.mainArtist ?? null,
    song_title: input.songTitle ?? null,
    display_title: input.displayTitle ?? null,
    artist_origin_country: input.artistOriginCountry ?? null,
  });
}

/**
 * ライブラリ API / 索引の行フィルタ。
 * - `catalog_scope` が western / domestic ならそれを優先
 * - `unknown` のみ従来ヒューリスティック（`admin-library-jp-exclude`）にフォールバック
 */
export function songRowMatchesLibraryCatalogFilter(
  row: SongRowForCatalogFilter,
  catalog: LibraryCatalogFilter,
): boolean {
  if (catalog === 'all') return true;

  // 洋楽扱い日本人アーティスト: 洋楽・邦楽どちらのタブでも表示
  if (librarySongRowMatchesWesternTreatedJpArtist(row)) return true;

  const scope = normalizeSongCatalogScope(row.catalog_scope);
  if (scope === 'western') return catalog === 'western';
  if (scope === 'domestic') return catalog === 'domestic';

  const looksDomestic = songRowLooksJapaneseDomesticForAdminLibrary({
    main_artist: row.main_artist,
    song_title: row.song_title,
    display_title: row.display_title,
  });
  if (catalog === 'western') return !looksDomestic;
  return looksDomestic;
}

/** 管理画面の曲行に「邦楽」ラベルを付けるか（`catalog_scope` 優先、なければメタヒューリスティック）。 */
export function isAdminSongJapaneseDomesticDisplay(row: SongRowForCatalogFilter): boolean {
  if (
    matchesDomesticJpArtist(row.main_artist, row.display_title, row.song_title)
  ) {
    return true;
  }
  const scope = normalizeSongCatalogScope(row.catalog_scope);
  if (scope === 'domestic') return true;
  if (scope === 'western') return false;
  return songRowLooksJapaneseDomesticForAdminLibrary({
    main_artist: row.main_artist,
    song_title: row.song_title,
    display_title: row.display_title,
  });
}

export function filterSongRowsByLibraryCatalog<T extends SongRowForCatalogFilter>(
  rows: T[],
  catalog: LibraryCatalogFilter,
): T[] {
  if (catalog === 'all') return rows;
  return rows.filter((r) => songRowMatchesLibraryCatalogFilter(r, catalog));
}
