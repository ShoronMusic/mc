/**
 * Music Library 公開カタログの DB 取得。
 * 仕様: docs/00-music-library-spec.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { stripLeadingArticleForSort, indexLetterForArtist } from '@/lib/admin-library-index';
import { loadArtistMemberGraph, shouldShowArtistMembersLine } from '@/lib/artist-members';
import { pickArtistPhotoUrl } from '@/lib/artist-photo-url';
import {
  getLibraryArtistIndexCached,
  onLibraryArtistIndexCacheCleared,
} from '@/lib/build-library-artist-index';
import {
  compareLibraryReleaseSort,
  libraryEffectiveReleaseDateForSort,
  resolveLibraryOriginalReleaseDate,
} from '@/lib/library-release-sort-date';
import {
  buildLibraryArtistExternalLinks,
  formatLibraryArtistAgeLabel,
  formatLibraryOriginCountry,
} from '@/lib/library-artist-public-display';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import {
  artistNamesMatchIgnoringLeadingArticle,
  expandLibrarySearchQueryVariants,
  libraryArtistNameLookupVariants,
  parseCollabArtistNamesFromMainArtist,
  preferLibraryArtistDisplayName,
  resolveMainArtistsForLibrarySearch,
} from '@/lib/library-search-query';
import {
  compactArtistSearchNicknameKey,
  resolveArtistSearchNicknameCanonical,
} from '@/lib/artist-search-nicknames';
import {
  formatMusicLibraryActivePeriod,
  formatMusicLibraryOccupation,
  formatMusicLibraryOriginLabel,
  musicLibraryActiveStartYear,
  musicLibraryArtistNameFromRow,
  musicLibraryNameMatchesArtistSlug,
  musicLibraryVocalLabels,
  parseMusicLibrarySnapshotArtists,
  listMusicLibraryGenreLinks,
  resolveMusicLibraryArtistDisplayName,
} from '@/lib/music-library-labels';
import { extractMusic8SongFieldsFromPersistedSnapshot } from '@/lib/music8-song-fields';
import { usableLibraryMusic8Intro } from '@/lib/library-song-commentary-text';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';
import { artistNameToMusic8Slug, formatArtistBorn, formatArtistDied } from '@/lib/music8-artist-display';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';
import {
  MUSIC8_NAV_STYLE_LABELS,
  MUSIC8_NAV_STYLE_SLUGS,
  music8NavStyleColumnValues,
  music8NavStyleSlugFromName,
  type Music8NavStyleSlug,
} from '@/lib/music8-catalog-slugs';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  defaultLibraryCatalogFilter,
  filterSongRowsByLibraryCatalog,
  type LibraryCatalogFilter,
} from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import {
  getGenreBestBySlug,
  getGenreBestLabelsForSongs,
  isCatalogPlaylistTableMissingError,
  listGenreBestPlaylists,
  type GenreBestListItem,
} from '@/lib/catalog-genre-best';
import {
  formatWeeklyChartWeekLabel,
  loadLatestWeeklyChartIssue,
  weeklyChartPublicSubtitle,
  weeklyChartPublicTitle,
  type WeeklyChartRegion,
} from '@/lib/weekly-charts';
import {
  MUSIC_LIBRARY_PAGE_SIZE,
  MUSIC_LIBRARY_TOP_PER_STYLE,
  isMusicLibraryReservedSlug,
  musicLibraryArtistHref,
  musicLibraryArtistLetterParam,
  musicLibrarySongHref,
  musicLibraryTotalPages,
  parseMusicLibraryArtistSearchQuery,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
} from '@/lib/music-library-urls';
import {
  emptyMusicLibraryArtistProfile,
  type MusicLibraryArtistCharts,
  type MusicLibraryArtistProfile,
  type MusicLibraryListArtist,
  type MusicLibrarySongCard,
} from '@/lib/music-library-types';
import { buildMusicLibraryArtistCharts } from '@/lib/music-library-artist-charts';

export type { MusicLibrarySongCard, MusicLibraryArtistProfile } from '@/lib/music-library-types';
export { musicLibraryPlayableTracks } from '@/lib/music-library-types';

const STYLE_CACHE_TTL_MS = 2 * 60 * 1000;
const SONG_ID_CHUNK = 80;
const VIDEO_CHUNK = 80;

const SONG_LIST_SELECT =
  'id, main_artist, song_title, display_title, original_release_date, catalog_scope, music8_artist_slug, music8_song_slug, spotify_images, music8_song_data, catalog_published_at, style, vocal, genres, music8_video_id, primary_artist_name_ja, music8_intro';

/** `songs.style` が別ナビならそのスタイル一覧から除外。空なら JOIN 側を尊重。 */
export function musicLibrarySongBelongsToNavStyle(
  rowStyle: string | null | undefined,
  styleSlug: string,
): boolean {
  const mapped = music8NavStyleSlugFromName(rowStyle ?? '');
  if (!mapped) return true;
  return mapped === styleSlug;
}

function mergeSongRowsById(a: SongListRow[], b: SongListRow[]): SongListRow[] {
  const map = new Map<string, SongListRow>();
  for (const row of [...a, ...b]) {
    if (row?.id) map.set(row.id, row);
  }
  return [...map.values()];
}

function requestedStyleRowCount(range: { from: number; to: number } | { limit: number }): number {
  if ('limit' in range) return range.limit;
  return Math.max(0, range.to - range.from + 1);
}

export type MusicLibraryStyleSummary = {
  slug: Music8NavStyleSlug;
  name: string;
  count: number;
};

export type MusicLibraryArtistIndexEntry = {
  name: string;
  slug: string;
  href: string;
  count: number;
  indexLetter: string;
  originLabel?: string | null;
  activeStartYear?: number | null;
  imageUrl?: string | null;
  styleSlug?: string | null;
  /** 統合した別名（5sos 等）。検索用。 */
  searchNames?: string[];
};

const RESOLVED_ARTIST_INDEX_TTL_MS = 15 * 60 * 1000;
const RESOLVED_ARTIST_INDEX_CACHE_GEN = 10;
const ARTIST_NAME_LOOKUP_CHUNK = 120;
const ARTIST_NAME_LOOKUP_CONCURRENCY = 6;
const resolvedArtistIndexCache = new Map<
  LibraryCatalogFilter,
  { at: number; gen: number; value: { letters: string[]; items: MusicLibraryArtistIndexEntry[] } }
>();

onLibraryArtistIndexCacheCleared(() => {
  resolvedArtistIndexCache.clear();
});

export type MusicLibrarySongDetail = MusicLibrarySongCard & {
  intro: string | null;
  vocal: string | null;
  styleLabel: string | null;
  credits: { name: string; slug: string | null; href: string | null }[];
};

type SongListRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  original_release_date: string | null;
  catalog_scope?: string | null;
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
  spotify_images?: string | null;
  music8_song_data?: unknown;
  catalog_published_at?: string | null;
  style?: string | null;
  vocal?: string | null;
  genres?: unknown;
  music8_video_id?: string | null;
  primary_artist_name_ja?: string | null;
  music8_intro?: string | null;
};

type VideoPick = { videoId: string; youtubePublishedAt: string | null };

type StyleCacheEntry = { at: number; rows: SongListRow[] };

const styleSongCache = new Map<string, StyleCacheEntry>();

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function songTitleOf(row: SongListRow): string {
  return (row.song_title ?? row.display_title ?? '').trim() || 'Untitled';
}

function artistNameOf(row: SongListRow): string {
  return (row.main_artist ?? '').trim() || 'Unknown';
}

export function musicLibraryArtistSlugForName(name: string, storedSlug?: string | null): string | null {
  const stored = (storedSlug ?? '').trim().toLowerCase();
  if (stored && !isMusicLibraryReservedSlug(stored)) return stored;
  const computed = artistNameToMusic8Slug(name);
  if (!computed || isMusicLibraryReservedSlug(computed)) return null;
  return computed;
}

export type RankedVideoRow = {
  song_id: string;
  video_id: string;
  variant?: string | null;
  youtube_published_at?: string | null;
};

export function pickRankedVideosBySong(rows: RankedVideoRow[]): Map<string, VideoPick> {
  const ranked = new Map<string, { videoId: string; rank: number; youtubePublishedAt: string | null }>();
  for (const row of rows) {
    if (!row.song_id || !row.video_id) continue;
    const yt =
      typeof row.youtube_published_at === 'string' && row.youtube_published_at.trim()
        ? row.youtube_published_at.trim()
        : null;
    const nextRank = rankLibraryVideoVariant(row.variant);
    const cur = ranked.get(row.song_id);
    if (!cur || nextRank < cur.rank) {
      ranked.set(row.song_id, { videoId: row.video_id, rank: nextRank, youtubePublishedAt: yt });
    }
  }
  const out = new Map<string, VideoPick>();
  for (const [id, v] of ranked) {
    out.set(id, { videoId: v.videoId, youtubePublishedAt: v.youtubePublishedAt });
  }
  return out;
}

function sortKeyForRow(row: SongListRow, youtubePublishedAt?: string | null): {
  originalReleaseDate: string | null;
  youtubePublishedAt: string | null;
} {
  const original = resolveLibraryOriginalReleaseDate({
    originalReleaseDate: row.original_release_date,
    music8SongData: row.music8_song_data,
  });
  const yt =
    (youtubePublishedAt ?? '').trim() ||
    (typeof row.catalog_published_at === 'string' ? row.catalog_published_at.trim() : '') ||
    null;
  return { originalReleaseDate: original, youtubePublishedAt: yt };
}

export function sortMusicLibrarySongs<T extends SongListRow>(
  rows: T[],
  youtubeBySong?: Map<string, string | null>,
): T[] {
  return [...rows].sort((a, b) => {
    const cmp = compareLibraryReleaseSort(
      sortKeyForRow(a, youtubeBySong?.get(a.id)),
      sortKeyForRow(b, youtubeBySong?.get(b.id)),
      'desc',
    );
    if (cmp !== 0) return cmp;
    return songTitleOf(a).localeCompare(songTitleOf(b), 'en', { sensitivity: 'base' });
  });
}

export function toMusicLibrarySongCard(
  row: SongListRow,
  videoId: string | null,
  styleSlug?: string | null,
): MusicLibrarySongCard {
  const artistName = artistNameOf(row);
  const artistSlug = musicLibraryArtistSlugForName(artistName, row.music8_artist_slug);
  const songSlug = (row.music8_song_slug ?? '').trim().toLowerCase() || null;
  const href = artistSlug && songSlug ? musicLibrarySongHref(artistSlug, songSlug) : null;
  const dates = sortKeyForRow(row, null);
  const release = libraryEffectiveReleaseDateForSort(dates);
  const snap = extractMusic8SongFieldsFromPersistedSnapshot(row.music8_song_data);
  const vocalFromCol = musicLibraryVocalLabels(row.vocal);
  const vocalLabels = vocalFromCol.length ? vocalFromCol : musicLibraryVocalLabels(snap?.vocalLabel);
  const genreLinks = listMusicLibraryGenreLinks({
    columnGenres: row.genres,
    snapshotGenres: snap?.genres ?? null,
  });
  const genreLabel = genreLinks.length > 0 ? genreLinks.map((g) => g.name).join(' / ') : null;
  const artists = resolveMusicLibraryListArtists({
    artistName,
    artistSlug,
    snapshotArtists: parseMusicLibrarySnapshotArtists(row.music8_song_data),
  });
  const fromArg =
    styleSlug && (MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(styleSlug)
      ? (styleSlug as Music8NavStyleSlug)
      : null;
  const resolvedStyleSlug = fromArg ?? music8NavStyleSlugFromName(row.style ?? '') ?? null;
  const styleLabel =
    (row.style ?? '').trim() ||
    (resolvedStyleSlug ? MUSIC8_NAV_STYLE_LABELS[resolvedStyleSlug] : '') ||
    null;
  return {
    id: row.id,
    songTitle: songTitleOf(row),
    artistName,
    artistSlug,
    songSlug,
    href,
    artistHref: artistSlug ? musicLibraryArtistHref(artistSlug) : null,
    videoId: videoId || (row.music8_video_id ?? '').trim() || null,
    spotifyImages: (row.spotify_images ?? '').trim() || null,
    releaseDate: release,
    styleSlug: resolvedStyleSlug,
    styleLabel,
    vocalLabels,
    genreLabel,
    genreLinks,
    artists,
    intro: usableLibraryMusic8Intro(row.music8_intro),
  };
}

function toListArtist(
  name: string,
  storedSlug?: string | null,
  originRaw?: string | null,
): MusicLibraryListArtist {
  const trimmed = name.trim();
  const slug = musicLibraryArtistSlugForName(trimmed, storedSlug);
  return {
    name: trimmed,
    slug,
    href: slug ? musicLibraryArtistHref(slug) : null,
    originLabel: formatMusicLibraryOriginLabel(originRaw),
  };
}

function musicLibraryArtistSlugKeys(slug: string | null | undefined): string[] {
  const s = (slug ?? '').trim().toLowerCase();
  if (!s) return [];
  const keys = new Set<string>([s]);
  if (s.startsWith('the-')) keys.add(s.slice(4));
  else keys.add(`the-${s}`);
  return [...keys].filter(Boolean);
}

function musicLibraryArtistNameKeys(name: string): string[] {
  return [
    ...new Set(
      libraryArtistNameLookupVariants(name)
        .map((n) => n.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

type ResolvedArtistIndexRef = {
  slug: string;
  displayName: string;
  originLabel: string | null;
  activeStartYear: number | null;
  imageUrl: string | null;
};

/** 同じ slug のマスタ行が複数あるとき、写真・国籍・slug 一致名を残す。 */
export function mergeMusicLibraryArtistIndexRefs(
  a: ResolvedArtistIndexRef,
  b: ResolvedArtistIndexRef,
): ResolvedArtistIndexRef {
  const slug = a.slug || b.slug;
  const aOk = musicLibraryNameMatchesArtistSlug(a.displayName, slug);
  const bOk = musicLibraryNameMatchesArtistSlug(b.displayName, slug);
  let displayName = a.displayName;
  if (bOk && !aOk) displayName = b.displayName;
  else if (aOk === bOk && a.displayName !== b.displayName) {
    if (a.displayName === a.displayName.toLowerCase() && b.displayName !== b.displayName.toLowerCase()) {
      displayName = b.displayName;
    }
  }
  return {
    slug,
    displayName,
    originLabel: a.originLabel || b.originLabel,
    activeStartYear: a.activeStartYear ?? b.activeStartYear,
    imageUrl: a.imageUrl || b.imageUrl,
  };
}

/** 曲の main_artist 表記（ash）からマスタ行（Ash）を拾う。 */
export function lookupMusicLibraryArtistIndexRef(
  byKey: Map<string, ResolvedArtistIndexRef>,
  mainArtist: string,
): ResolvedArtistIndexRef | undefined {
  const name = mainArtist.trim();
  if (!name) return undefined;
  const slug = musicLibraryArtistSlugForName(name);
  return (
    byKey.get(name.toLowerCase()) ??
    byKey.get(stripLeadingArticleForSort(name).toLowerCase()) ??
    (slug ? byKey.get(slug) : undefined)
  );
}

/** マスタ英語名があれば曲側の小文字表記より優先する。 */
export function musicLibraryArtistIndexDisplayName(input: {
  mainArtist: string;
  slug: string;
  resolvedDisplayName?: string | null;
}): string {
  const canonical = (input.resolvedDisplayName ?? '').trim();
  return resolveMusicLibraryArtistDisplayName({
    name: canonical || input.mainArtist,
    slug: input.slug,
    fallbacks: [input.mainArtist, canonical],
  });
}

type ArtistJoinRow = {
  name?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
  music8_artist_slug?: string | null;
  origin_country?: string | null;
};

export function resolveMusicLibraryListArtists(input: {
  artistName: string;
  artistSlug: string | null;
  creditArtists?: MusicLibraryListArtist[];
  snapshotArtists?: { name: string; slug: string | null }[];
}): MusicLibraryListArtist[] {
  const credits = (input.creditArtists ?? []).filter((a) => a.name.trim());
  if (credits.length >= 2) return credits;
  const snap = (input.snapshotArtists ?? []).filter((a) => a.name.trim());
  if (snap.length >= 2) {
    return snap.map((a) => toListArtist(a.name, a.slug));
  }
  const parsed = parseCollabArtistNamesFromMainArtist(input.artistName);
  if (parsed.length >= 2) {
    return parsed.map((name, i) => toListArtist(name, i === 0 ? input.artistSlug : null));
  }
  if (credits.length === 1) return credits;
  if (snap.length === 1) return [toListArtist(snap[0]!.name, snap[0]!.slug ?? input.artistSlug)];
  return [toListArtist(input.artistName, input.artistSlug)];
}

export function takeNewestPerStyle(
  byStyle: Map<string, MusicLibrarySongCard[]>,
  perStyle = MUSIC_LIBRARY_TOP_PER_STYLE,
): { slug: Music8NavStyleSlug; name: string; songs: MusicLibrarySongCard[] }[] {
  return MUSIC8_NAV_STYLE_SLUGS.map((slug) => ({
    slug,
    name: MUSIC8_NAV_STYLE_LABELS[slug],
    songs: (byStyle.get(slug) ?? []).slice(0, perStyle),
  }));
}

export function getMusicLibraryAdmin(): SupabaseClient | null {
  return createAdminClient();
}

export function musicLibraryCatalogFilter(): LibraryCatalogFilter {
  return defaultLibraryCatalogFilter();
}

async function fetchSongRowsByIds(admin: SupabaseClient, ids: string[]): Promise<SongListRow[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const out: SongListRow[] = [];
  for (const chunk of chunkArray(unique, SONG_ID_CHUNK)) {
    const { data, error } = await admin.from('songs').select(SONG_LIST_SELECT).in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as SongListRow[]) {
      if (row?.id) out.push(row);
    }
  }
  return out;
}

export async function attachVideosToSongs(
  admin: SupabaseClient,
  rows: SongListRow[],
): Promise<{ cards: MusicLibrarySongCard[]; youtubeBySong: Map<string, string | null> }> {
  const ids = rows.map((r) => r.id);
  const youtubeBySong = new Map<string, string | null>();
  const videoBySong = new Map<string, string>();
  if (ids.length === 0) return { cards: [], youtubeBySong };

  const vidRows: RankedVideoRow[] = [];
  for (const chunk of chunkArray(ids, VIDEO_CHUNK)) {
    const { data, error } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, youtube_published_at')
      .in('song_id', chunk);
    if (error) {
      if (error.code === '42P01') break;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as RankedVideoRow[]) vidRows.push(row);
  }
  const picked = pickRankedVideosBySong(vidRows);
  for (const [id, v] of picked) {
    videoBySong.set(id, v.videoId);
    youtubeBySong.set(id, v.youtubePublishedAt);
  }

  const cards = rows.map((row) => toMusicLibrarySongCard(row, videoBySong.get(row.id) ?? null));
  for (const card of cards) {
    const yt = youtubeBySong.get(card.id);
    if (!card.releaseDate && yt) {
      const d = yt.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) card.releaseDate = d;
    }
  }
  const withArtists = await attachMusicLibraryListArtists(admin, cards, rows);
  await attachGenreBestLabels(admin, withArtists);
  return { cards: withArtists, youtubeBySong };
}

/** 曲一覧の Genre BEST ラベル。テーブル未作成・取得失敗でも曲一覧自体は出す。 */
async function attachGenreBestLabels(
  admin: SupabaseClient,
  cards: MusicLibrarySongCard[],
): Promise<void> {
  const ids = cards.map((c) => c.id).filter(Boolean);
  if (ids.length === 0) return;
  try {
    const bySongId: Record<string, { slug: string; title: string }[]> = {};
    for (const chunk of chunkArray(ids, SONG_ID_CHUNK)) {
      const { bySongId: part, error, tableMissing } = await getGenreBestLabelsForSongs(admin, chunk);
      if (tableMissing) return;
      if (error) {
        console.warn('[music-library] genre-best labels', error);
        return;
      }
      Object.assign(bySongId, part);
    }
    for (const card of cards) {
      const labels = bySongId[card.id];
      if (labels?.length) card.genreBestLabels = labels;
    }
  } catch (e) {
    console.warn('[music-library] genre-best labels', e);
  }
}

type ArtistOriginRow = {
  music8_artist_slug?: string | null;
  name?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
  origin_country?: string | null;
};

type SongCreditJoinRow = {
  song_id?: string | null;
  display_order?: number | null;
  artists?: ArtistJoinRow | ArtistJoinRow[] | null;
};

function creditArtistFromJoin(
  nested: ArtistJoinRow | ArtistJoinRow[] | null | undefined,
): MusicLibraryListArtist | null {
  const artist = Array.isArray(nested) ? nested[0] : nested;
  const name = musicLibraryArtistNameFromRow(artist ?? {}) || (artist?.name ?? '').trim();
  if (!name) return null;
  return toListArtist(name, artist?.music8_artist_slug, artist?.origin_country);
}

const CREDIT_ARTISTS_SELECT =
  'song_id, display_order, artists(name, name_base, the_prefix, music8_artist_slug, origin_country)';
const CREDIT_ARTISTS_SELECT_MIN =
  'song_id, display_order, artists(name, music8_artist_slug, origin_country)';

function pushUniqueListArtist(list: MusicLibraryListArtist[], artist: MusicLibraryListArtist): void {
  const existingIdx = list.findIndex((x) => artistNamesMatchIgnoringLeadingArticle(x.name, artist.name));
  if (existingIdx < 0) {
    list.push(artist);
    return;
  }
  const existing = list[existingIdx]!;
  const preferredName = preferLibraryArtistDisplayName(existing.name, artist.name);
  list[existingIdx] = {
    ...existing,
    name: preferredName,
    slug: existing.slug || artist.slug,
    href: existing.href || artist.href,
    originLabel: existing.originLabel || artist.originLabel,
  };
}

async function fetchMusicLibraryCreditArtists(
  admin: SupabaseClient,
  songIds: string[],
): Promise<Map<string, MusicLibraryListArtist[]>> {
  const bySong = new Map<string, MusicLibraryListArtist[]>();
  if (songIds.length === 0) return bySong;
  let select = CREDIT_ARTISTS_SELECT;
  for (const chunk of chunkArray([...new Set(songIds)], SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('song_credits')
      .select(select)
      .in('song_id', chunk)
      .order('display_order', { ascending: true });
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return bySong;
      if (error.code === '42703' && select === CREDIT_ARTISTS_SELECT) {
        select = CREDIT_ARTISTS_SELECT_MIN;
        const retry = await admin
          .from('song_credits')
          .select(select)
          .in('song_id', chunk)
          .order('display_order', { ascending: true });
        if (retry.error) {
          if (retry.error.code === '42P01' || retry.error.code === '42703' || retry.error.code === 'PGRST205') {
            return bySong;
          }
          throw new Error(retry.error.message);
        }
        mergeCreditRows(bySong, (retry.data ?? []) as SongCreditJoinRow[]);
        continue;
      }
      throw new Error(error.message);
    }
    mergeCreditRows(bySong, (data ?? []) as SongCreditJoinRow[]);
  }
  return bySong;
}

function mergeCreditRows(bySong: Map<string, MusicLibraryListArtist[]>, rows: SongCreditJoinRow[]): void {
  const sorted = [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  for (const row of sorted) {
    const songId = (row.song_id ?? '').trim();
    const artist = creditArtistFromJoin(row.artists);
    if (!songId || !artist) continue;
    const list = bySong.get(songId) ?? [];
    pushUniqueListArtist(list, artist);
    bySong.set(songId, list);
  }
}

export async function attachMusicLibraryListArtists(
  admin: SupabaseClient,
  cards: MusicLibrarySongCard[],
  rows: SongListRow[] = [],
): Promise<MusicLibrarySongCard[]> {
  if (cards.length === 0) return cards;
  const creditsBySong = await fetchMusicLibraryCreditArtists(
    admin,
    cards.map((c) => c.id),
  );
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const withArtists = cards.map((card) => {
    const row = rowById.get(card.id);
    const artists = resolveMusicLibraryListArtists({
      artistName: card.artistName,
      artistSlug: card.artistSlug,
      creditArtists: creditsBySong.get(card.id) ?? [],
      snapshotArtists: parseMusicLibrarySnapshotArtists(row?.music8_song_data),
    });
    return { ...card, artists };
  });

  const originBySlug = new Map<string, string>();
  const originByName = new Map<string, string>();
  const displayBySlug = new Map<string, string>();
  const displayByName = new Map<string, string>();
  const rememberDisplay = (display: string, slug?: string | null, extraNames: string[] = []) => {
    const name = display.trim();
    if (!name) return;
    for (const key of musicLibraryArtistSlugKeys(slug)) displayBySlug.set(key, name);
    for (const raw of [name, ...extraNames]) {
      for (const key of musicLibraryArtistNameKeys(raw)) displayByName.set(key, name);
    }
  };
  const remember = (row: ArtistOriginRow) => {
    const display = musicLibraryArtistNameFromRow(row) || (row.name ?? '').trim();
    const origin = formatMusicLibraryOriginLabel(row.origin_country);
    rememberDisplay(display, row.music8_artist_slug, [
      (row.name ?? '').trim(),
      (row.name_base ?? '').trim(),
    ]);
    if (!origin) return;
    for (const slug of musicLibraryArtistSlugKeys(row.music8_artist_slug)) {
      originBySlug.set(slug, origin);
    }
    if (display) {
      for (const key of musicLibraryArtistNameKeys(display)) originByName.set(key, origin);
    }
    const rawName = (row.name ?? '').trim();
    if (rawName) {
      for (const key of musicLibraryArtistNameKeys(rawName)) originByName.set(key, origin);
    }
    const base = (row.name_base ?? '').trim();
    if (base) originByName.set(base.toLowerCase(), origin);
  };
  for (const card of withArtists) {
    for (const artist of card.artists ?? []) {
      if (artist.originLabel) {
        if (artist.slug) originBySlug.set(artist.slug.toLowerCase(), artist.originLabel);
        originByName.set(artist.name.toLowerCase(), artist.originLabel);
      }
    }
  }

  const missingSlugs = [
    ...new Set(
      withArtists
        .flatMap((c) => c.artists ?? [])
        .filter((a) => {
          if (!a.slug) return false;
          if (!a.originLabel) return true;
          return !/^(the|a|an)\s+/i.test(a.name.trim());
        })
        .flatMap((a) => musicLibraryArtistSlugKeys(a.slug)),
    ),
  ];
  let artistOriginSelect =
    'music8_artist_slug, name, name_base, the_prefix, origin_country';
  for (const chunk of chunkArray(missingSlugs, SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('artists')
      .select(artistOriginSelect)
      .in('music8_artist_slug', chunk);
    if (error) {
      if (error.code === '42P01') break;
      if (error.code === '42703' && artistOriginSelect.includes('the_prefix')) {
        artistOriginSelect = 'music8_artist_slug, name, origin_country';
        const retry = await admin
          .from('artists')
          .select(artistOriginSelect)
          .in('music8_artist_slug', chunk);
        if (retry.error) {
          if (retry.error.code === '42P01' || retry.error.code === '42703') break;
          throw new Error(retry.error.message);
        }
        for (const row of (retry.data ?? []) as ArtistOriginRow[]) remember(row);
        continue;
      }
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as ArtistOriginRow[]) remember(row);
  }

  const missingNames = [
    ...new Set(
      withArtists
        .flatMap((c) => c.artists ?? [])
        .filter((a) => {
          const slugHit = musicLibraryArtistSlugKeys(a.slug).some(
            (k) => originBySlug.has(k) || displayBySlug.has(k),
          );
          if (slugHit && a.originLabel && /^(the|a|an)\s+/i.test(a.name.trim())) return false;
          if (slugHit && displayBySlug.size > 0 && musicLibraryArtistSlugKeys(a.slug).some((k) => displayBySlug.has(k))) {
            if (a.originLabel) return false;
          }
          return Boolean(a.name.trim());
        })
        .flatMap((a) => libraryArtistNameLookupVariants(a.name.trim())),
    ),
  ];
  for (const chunk of chunkArray(missingNames, SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('artists')
      .select(artistOriginSelect)
      .in('name', chunk);
    if (error) {
      if (error.code === '42P01' || error.code === '42703') break;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as ArtistOriginRow[]) remember(row);
  }

  const lookupDisplay = (artist: MusicLibraryListArtist): string | null => {
    for (const key of musicLibraryArtistSlugKeys(artist.slug)) {
      const n = displayBySlug.get(key);
      if (n) return n;
    }
    for (const key of musicLibraryArtistNameKeys(artist.name)) {
      const n = displayByName.get(key);
      if (n) return n;
    }
    return null;
  };
  const lookupOrigin = (artist: MusicLibraryListArtist): string | null => {
    if (artist.originLabel) return artist.originLabel;
    for (const key of musicLibraryArtistSlugKeys(artist.slug)) {
      const o = originBySlug.get(key);
      if (o) return o;
    }
    for (const key of musicLibraryArtistNameKeys(artist.name)) {
      const o = originByName.get(key);
      if (o) return o;
    }
    return null;
  };

  return withArtists.map((card) => {
    const artists = (card.artists ?? []).map((artist) => {
      const canonical = lookupDisplay(artist);
      const name = resolveMusicLibraryArtistDisplayName({
        name: artist.name,
        slug: artist.slug,
        fallbacks: [canonical, card.artistName],
      });
      const origin = lookupOrigin(artist);
      if (name === artist.name && origin === artist.originLabel) return artist;
      return { ...artist, name, originLabel: origin };
    });
    return { ...card, artists };
  });
}

async function fetchSongIdsForStyle(admin: SupabaseClient, styleSlug: string): Promise<string[]> {
  const { data: style, error: styleErr } = await admin
    .from('catalog_styles')
    .select('id')
    .eq('slug', styleSlug)
    .maybeSingle();
  if (styleErr) {
    if (styleErr.code === '42P01') return [];
    throw new Error(styleErr.message);
  }
  const styleId = (style as { id?: string } | null)?.id;
  if (!styleId) return [];

  const ids: string[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await admin
      .from('song_styles')
      .select('song_id')
      .eq('style_id', styleId)
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === '42P01') return [];
      throw new Error(error.message);
    }
    const rows = (data ?? []) as { song_id?: string }[];
    for (const row of rows) {
      if (row.song_id) ids.push(row.song_id);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function loadStyleSongRows(
  admin: SupabaseClient,
  styleSlug: string,
  catalog: LibraryCatalogFilter,
): Promise<SongListRow[]> {
  const key = `${catalog}:${styleSlug}`;
  const cached = styleSongCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < STYLE_CACHE_TTL_MS) return cached.rows;

  await ensureWesternTreatedJpArtistCache(admin);
  const ids = await fetchSongIdsForStyle(admin, styleSlug);
  const raw = await fetchSongRowsByIds(admin, ids);
  const kept = filterSongRowsByLibraryCatalog(raw, catalog).filter((row) =>
    musicLibrarySongBelongsToNavStyle(row.style, styleSlug),
  );
  const extra = await fetchSongsByStyleColumn(admin, styleSlug, catalog, { limit: 800 });
  const rows = sortMusicLibrarySongs(mergeSongRowsById(kept, extra));
  styleSongCache.set(key, { at: now, rows });
  return rows;
}

const SONG_STYLE_JOIN_SELECT = `${SONG_LIST_SELECT}, song_styles!inner(catalog_styles!inner(slug))`;

/**
 * JOIN 用の catalog_scope。
 * ma の western は「明示 domestic 以外」。Music8 曲の大半は unknown のままで、
 * `eq western` だと約 2 万曲がスタイル一覧から落ちる。
 */
export function musicLibrarySqlScopeMode(
  catalog: LibraryCatalogFilter,
): 'all' | 'exclude-domestic' | 'domestic-only' {
  if (catalog === 'domestic') return 'domestic-only';
  if (catalog === 'western') return 'exclude-domestic';
  return 'all';
}

function withCatalogScope<
  T extends { eq: (col: string, val: string) => T; neq: (col: string, val: string) => T },
>(query: T, catalog: LibraryCatalogFilter): T {
  const mode = musicLibrarySqlScopeMode(catalog);
  if (mode === 'domestic-only') return query.eq('catalog_scope', 'domestic');
  if (mode === 'exclude-domestic') return query.neq('catalog_scope', 'domestic');
  return query;
}

async function countSongsForStyleJoin(
  admin: SupabaseClient,
  styleSlug: string,
  catalog: LibraryCatalogFilter,
): Promise<number | null> {
  let query = admin
    .from('songs')
    .select('id, song_styles!inner(catalog_styles!inner(slug))', { count: 'exact', head: true })
    .eq('song_styles.catalog_styles.slug', styleSlug);
  query = withCatalogScope(query, catalog);
  const { count, error } = await query;
  if (error) {
    console.warn('[music-library] style count join', error.message);
    return null;
  }
  return typeof count === 'number' ? count : 0;
}

async function fetchSongsByStyleColumn(
  admin: SupabaseClient,
  styleSlug: string,
  catalog: LibraryCatalogFilter,
  range: { from: number; to: number } | { limit: number },
): Promise<SongListRow[]> {
  if (!(MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(styleSlug)) return [];
  const names = music8NavStyleColumnValues(styleSlug as Music8NavStyleSlug);
  if (names.length === 0) return [];
  await ensureWesternTreatedJpArtistCache(admin);
  let query = admin
    .from('songs')
    .select(SONG_LIST_SELECT)
    .in('style', names)
    .order('original_release_date', { ascending: false, nullsFirst: false });
  query = withCatalogScope(query, catalog);
  if ('limit' in range) {
    query = query.limit(range.limit);
  } else {
    query = query.range(range.from, range.to);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[music-library] style songs by column', error.message);
    return [];
  }
  return filterSongRowsByLibraryCatalog((data ?? []) as SongListRow[], catalog);
}

async function fetchStyleSongsViaJoin(
  admin: SupabaseClient,
  styleSlug: string,
  catalog: LibraryCatalogFilter,
  range: { from: number; to: number } | { limit: number },
): Promise<SongListRow[] | null> {
  await ensureWesternTreatedJpArtistCache(admin);
  let query = admin
    .from('songs')
    .select(SONG_STYLE_JOIN_SELECT)
    .eq('song_styles.catalog_styles.slug', styleSlug)
    .order('original_release_date', { ascending: false, nullsFirst: false });
  query = withCatalogScope(query, catalog);
  if ('limit' in range) {
    query = query.limit(range.limit);
  } else {
    query = query.range(range.from, range.to);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[music-library] style songs join', error.message);
    return null;
  }
  const kept = filterSongRowsByLibraryCatalog(data ?? [], catalog).filter((row) =>
    musicLibrarySongBelongsToNavStyle(row.style, styleSlug),
  );
  const extra = await fetchSongsByStyleColumn(admin, styleSlug, catalog, range);
  return sortMusicLibrarySongs(mergeSongRowsById(kept, extra)).slice(0, requestedStyleRowCount(range));
}

export async function fetchMusicLibraryStyleSummaries(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<MusicLibraryStyleSummary[]> {
  const summaries = await Promise.all(
    MUSIC8_NAV_STYLE_SLUGS.map(async (slug) => {
      const joinCount = await countSongsForStyleJoin(admin, slug, catalog);
      const count = joinCount ?? (await loadStyleSongRows(admin, slug, catalog)).length;
      return { slug, name: MUSIC8_NAV_STYLE_LABELS[slug], count };
    }),
  );
  return summaries;
}

export async function fetchMusicLibraryStylePage(
  admin: SupabaseClient,
  styleSlug: string,
  page: number,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{
  slug: Music8NavStyleSlug;
  name: string;
  cards: MusicLibrarySongCard[];
  page: number;
  totalPages: number;
  totalItems: number;
}> {
  const slug = styleSlug.trim().toLowerCase() as Music8NavStyleSlug;
  const safePage = parseMusicLibraryPageParam(page) ?? 1;
  const from = (safePage - 1) * MUSIC_LIBRARY_PAGE_SIZE;
  const to = from + MUSIC_LIBRARY_PAGE_SIZE - 1;

  const [joinRows, joinCount] = await Promise.all([
    fetchStyleSongsViaJoin(admin, slug, catalog, { from, to }),
    countSongsForStyleJoin(admin, slug, catalog),
  ]);

  if (joinRows && joinCount != null) {
    const { cards } = await attachVideosToSongs(admin, joinRows);
    const totalPages = musicLibraryTotalPages(joinCount, MUSIC_LIBRARY_PAGE_SIZE);
    return {
      slug,
      name: MUSIC8_NAV_STYLE_LABELS[slug] ?? slug,
      cards: cards.map((c) => ({ ...c, styleSlug: c.styleSlug ?? slug })),
      page: Math.min(safePage, totalPages),
      totalPages,
      totalItems: joinCount,
    };
  }

  const rows = await loadStyleSongRows(admin, slug, catalog);
  const sliced = sliceMusicLibraryPage(rows, page, MUSIC_LIBRARY_PAGE_SIZE);
  const { cards } = await attachVideosToSongs(admin, sliced.items);
  return {
    slug,
    name: MUSIC8_NAV_STYLE_LABELS[slug] ?? slug,
    cards: cards.map((c) => ({ ...c, styleSlug: c.styleSlug ?? slug })),
    page: sliced.page,
    totalPages: sliced.totalPages,
    totalItems: sliced.totalItems,
  };
}

export async function fetchMusicLibraryTopByStyle(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ slug: Music8NavStyleSlug; name: string; songs: MusicLibrarySongCard[] }[]> {
  const pairs = await Promise.all(
    MUSIC8_NAV_STYLE_SLUGS.map(async (slug) => {
      const joined = await fetchStyleSongsViaJoin(admin, slug, catalog, {
        limit: MUSIC_LIBRARY_TOP_PER_STYLE * 4,
      });
      const topRows = (joined ?? (await loadStyleSongRows(admin, slug, catalog))).slice(
        0,
        MUSIC_LIBRARY_TOP_PER_STYLE,
      );
      const { cards } = await attachVideosToSongs(admin, topRows);
      return [slug, cards.map((c) => ({ ...c, styleSlug: c.styleSlug ?? slug }))] as const;
    }),
  );
  const byStyle = new Map<string, MusicLibrarySongCard[]>();
  for (const [slug, cards] of pairs) byStyle.set(slug, cards);
  return takeNewestPerStyle(byStyle, MUSIC_LIBRARY_TOP_PER_STYLE);
}

const SONG_GENRE_JOIN_SELECT = `${SONG_LIST_SELECT}, song_genres!inner(catalog_genres!inner(slug))`;

export type MusicLibraryGenrePage = {
  slug: string;
  name: string;
  nameJa: string | null;
  cards: MusicLibrarySongCard[];
  page: number;
  totalPages: number;
  totalItems: number;
};

async function fetchCatalogGenreBySlug(
  admin: SupabaseClient,
  genreSlug: string,
): Promise<{ slug: string; name: string; nameJa: string | null } | null> {
  const slug = genreSlug.trim().toLowerCase();
  if (!slug) return null;
  const { data, error } = await admin
    .from('catalog_genres')
    .select('slug, name, name_ja')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  const row = data as { slug?: string | null; name?: string | null; name_ja?: string | null } | null;
  const name = (row?.name ?? '').trim();
  const resolvedSlug = (row?.slug ?? '').trim().toLowerCase() || slug;
  if (!name) return null;
  return { slug: resolvedSlug, name, nameJa: (row?.name_ja ?? '').trim() || null };
}

async function countSongsForGenreJoin(
  admin: SupabaseClient,
  genreSlug: string,
  catalog: LibraryCatalogFilter,
): Promise<number | null> {
  let query = admin
    .from('songs')
    .select('id, song_genres!inner(catalog_genres!inner(slug))', { count: 'exact', head: true })
    .eq('song_genres.catalog_genres.slug', genreSlug);
  query = withCatalogScope(query, catalog);
  const { count, error } = await query;
  if (error) {
    console.warn('[music-library] genre count join', error.message);
    return null;
  }
  return typeof count === 'number' ? count : 0;
}

async function fetchGenreSongsViaJoin(
  admin: SupabaseClient,
  genreSlug: string,
  catalog: LibraryCatalogFilter,
  range: { from: number; to: number } | { limit: number },
): Promise<SongListRow[] | null> {
  await ensureWesternTreatedJpArtistCache(admin);
  let query = admin
    .from('songs')
    .select(SONG_GENRE_JOIN_SELECT)
    .eq('song_genres.catalog_genres.slug', genreSlug)
    .order('original_release_date', { ascending: false, nullsFirst: false });
  query = withCatalogScope(query, catalog);
  if ('limit' in range) {
    query = query.limit(range.limit);
  } else {
    query = query.range(range.from, range.to);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('[music-library] genre songs join', error.message);
    return null;
  }
  return sortMusicLibrarySongs(filterSongRowsByLibraryCatalog(data ?? [], catalog)).slice(
    0,
    requestedStyleRowCount(range),
  );
}

export async function fetchMusicLibraryGenrePage(
  admin: SupabaseClient,
  genreSlug: string,
  page: number,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<MusicLibraryGenrePage | null> {
  const genre = await fetchCatalogGenreBySlug(admin, genreSlug);
  if (!genre) return null;
  const safePage = parseMusicLibraryPageParam(page) ?? 1;
  const from = (safePage - 1) * MUSIC_LIBRARY_PAGE_SIZE;
  const to = from + MUSIC_LIBRARY_PAGE_SIZE - 1;

  const [joinRows, joinCount] = await Promise.all([
    fetchGenreSongsViaJoin(admin, genre.slug, catalog, { from, to }),
    countSongsForGenreJoin(admin, genre.slug, catalog),
  ]);

  if (joinRows && joinCount != null) {
    const { cards } = await attachVideosToSongs(admin, joinRows);
    const totalPages = musicLibraryTotalPages(joinCount, MUSIC_LIBRARY_PAGE_SIZE);
    return {
      slug: genre.slug,
      name: genre.name,
      nameJa: genre.nameJa,
      cards,
      page: Math.min(safePage, Math.max(1, totalPages)),
      totalPages,
      totalItems: joinCount,
    };
  }

  return {
    slug: genre.slug,
    name: genre.name,
    nameJa: genre.nameJa,
    cards: [],
    page: 1,
    totalPages: 1,
    totalItems: 0,
  };
}

export type MusicLibraryGenreBestPage = {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  showGenreBestSubtitle: boolean;
  styles: string[];
  cards: MusicLibrarySongCard[];
  page: number;
  totalPages: number;
  totalItems: number;
};

async function recountGenreBestPublicSongCounts(
  admin: SupabaseClient,
  items: GenreBestListItem[],
  catalog: LibraryCatalogFilter,
): Promise<GenreBestListItem[]> {
  if (items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const links: Array<{ playlist_id?: string; song_id?: string }> = [];
  for (const chunk of chunkArray(ids, SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('catalog_playlist_songs')
      .select('playlist_id, song_id')
      .in('playlist_id', chunk);
    if (error) {
      if (isCatalogPlaylistTableMissingError(error.message)) return items;
      console.warn('[music-library] genre-best song links', error.message);
      return items;
    }
    if (Array.isArray(data)) links.push(...(data as Array<{ playlist_id?: string; song_id?: string }>));
  }
  const songIds = [...new Set(links.map((l) => (l.song_id ?? '').trim()).filter(Boolean))];
  const allowed = new Set<string>();
  if (songIds.length > 0) {
    const rows = await fetchSongRowsByIds(admin, songIds);
    for (const row of filterSongRowsByLibraryCatalog(rows, catalog)) {
      if (row.id) allowed.add(row.id);
    }
  }
  const countByPlaylist = new Map<string, number>();
  for (const link of links) {
    const playlistId = (link.playlist_id ?? '').trim();
    const songId = (link.song_id ?? '').trim();
    if (!playlistId || !songId || !allowed.has(songId)) continue;
    countByPlaylist.set(playlistId, (countByPlaylist.get(playlistId) ?? 0) + 1);
  }
  return items.map((item) => ({
    ...item,
    songCount: countByPlaylist.get(item.id) ?? 0,
  }));
}

export async function fetchMusicLibraryGenreBestList(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ items: GenreBestListItem[]; tableMissing?: boolean }> {
  const { items, error, tableMissing } = await listGenreBestPlaylists(admin);
  if (tableMissing) return { items: [], tableMissing: true };
  if (error) {
    console.warn('[music-library] genre-best list', error);
    return { items: [] };
  }
  const counted = await recountGenreBestPublicSongCounts(admin, items, catalog);
  return { items: counted };
}

export async function fetchMusicLibraryGenreBestPage(
  admin: SupabaseClient,
  slug: string,
  page: number,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<MusicLibraryGenreBestPage | null> {
  const { detail, error, tableMissing } = await getGenreBestBySlug(admin, slug);
  if (tableMissing || error) {
    if (error && !tableMissing) console.warn('[music-library] genre-best detail', error);
    return null;
  }
  if (!detail) return null;

  const orderedIds = detail.songs.map((s) => s.songId).filter(Boolean);
  const rows = await fetchSongRowsByIds(admin, orderedIds);
  const byId = new Map(filterSongRowsByLibraryCatalog(rows, catalog).map((row) => [row.id, row]));
  const orderedRows = orderedIds.map((id) => byId.get(id)).filter((row): row is SongListRow => !!row);
  const sliced = sliceMusicLibraryPage(orderedRows, page, MUSIC_LIBRARY_PAGE_SIZE);
  const { cards } = await attachVideosToSongs(admin, sliced.items);

  return {
    slug: detail.slug,
    title: detail.title,
    description: detail.description,
    coverImageUrl: detail.coverImageUrl,
    showGenreBestSubtitle: detail.showGenreBestSubtitle,
    styles: detail.styles,
    cards,
    page: sliced.page,
    totalPages: sliced.totalPages,
    totalItems: sliced.totalItems,
  };
}

export type MusicLibraryWeeklyChartPage = {
  region: WeeklyChartRegion;
  title: string;
  subtitle: string;
  chartWeek: string;
  chartWeekLabel: string;
  playlistName: string | null;
  cards: MusicLibrarySongCard[];
  chartSize: number;
};

export type MusicLibraryWeeklyChartIndexItem = {
  region: WeeklyChartRegion;
  title: string;
  subtitle: string;
  chartWeek: string | null;
  chartWeekLabel: string | null;
  songCount: number;
  available: boolean;
};

export async function fetchMusicLibraryWeeklyChartPage(
  admin: SupabaseClient,
  region: WeeklyChartRegion,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ page: MusicLibraryWeeklyChartPage | null; tableMissing?: boolean }> {
  const { issue, error, tableMissing } = await loadLatestWeeklyChartIssue(admin, region, false);
  if (tableMissing) return { page: null, tableMissing: true };
  if (error) {
    console.warn('[music-library] weekly-chart', error);
    return { page: null };
  }
  if (!issue) return { page: null };

  const linked = issue.entries.filter((e) => e.songId).sort((a, b) => a.position - b.position);
  const orderedIds = linked.map((e) => e.songId as string);
  const rows = await fetchSongRowsByIds(admin, orderedIds);
  const byId = new Map(filterSongRowsByLibraryCatalog(rows, catalog).map((row) => [row.id, row]));
  const orderedRows: SongListRow[] = [];
  const positions: number[] = [];
  for (const entry of linked) {
    const row = byId.get(entry.songId as string);
    if (!row) continue;
    orderedRows.push(row);
    positions.push(entry.position);
  }
  const { cards } = await attachVideosToSongs(admin, orderedRows);
  return {
    page: {
      region,
      title: weeklyChartPublicTitle(region),
      subtitle: weeklyChartPublicSubtitle(),
      chartWeek: issue.chartWeek,
      chartWeekLabel: formatWeeklyChartWeekLabel(issue.chartWeek),
      playlistName: issue.playlistName,
      cards: cards.map((card, i) => ({ ...card, chartPosition: positions[i] ?? null })),
      chartSize: issue.entries.length,
    },
  };
}

export async function fetchMusicLibraryWeeklyChartIndex(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ items: MusicLibraryWeeklyChartIndexItem[]; tableMissing?: boolean }> {
  const items: MusicLibraryWeeklyChartIndexItem[] = [];
  for (const region of ['us', 'uk'] as WeeklyChartRegion[]) {
    const { page, tableMissing } = await fetchMusicLibraryWeeklyChartPage(admin, region, catalog);
    if (tableMissing) return { items: [], tableMissing: true };
    items.push({
      region,
      title: weeklyChartPublicTitle(region),
      subtitle: weeklyChartPublicSubtitle(),
      chartWeek: page?.chartWeek ?? null,
      chartWeekLabel: page?.chartWeekLabel ?? null,
      songCount: page?.cards.length ?? 0,
      available: Boolean(page),
    });
  }
  return { items };
}

async function resolveArtistSlugsByNames(
  admin: SupabaseClient,
  names: string[],
): Promise<Map<string, ResolvedArtistIndexRef>> {
  const out = new Map<string, ResolvedArtistIndexRef>();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const queryNames = [...new Set(unique.flatMap((n) => libraryArtistNameLookupVariants(n)))];
  let select =
    'name, name_base, the_prefix, music8_artist_slug, origin_country, active_period, image_url, spotify_artist_images';
  const putRef = (key: string, ref: ResolvedArtistIndexRef) => {
    const existing = out.get(key);
    out.set(key, existing ? mergeMusicLibraryArtistIndexRefs(existing, ref) : ref);
  };
  const remember = (row: {
    name?: string | null;
    name_base?: string | null;
    the_prefix?: string | null;
    music8_artist_slug?: string | null;
    origin_country?: string | null;
    active_period?: string | null;
    image_url?: string | null;
    spotify_artist_images?: string | null;
  }) => {
    const rawDisplay = musicLibraryArtistNameFromRow(row) || (row.name ?? '').trim();
    const slug = musicLibraryArtistSlugForName(rawDisplay || (row.name ?? ''), row.music8_artist_slug);
    if (!slug) return;
    const displayName = resolveMusicLibraryArtistDisplayName({
      name: rawDisplay,
      slug,
      fallbacks: [(row.name ?? '').trim()],
    });
    if (!displayName) return;
    const ref: ResolvedArtistIndexRef = {
      slug,
      displayName,
      originLabel: formatMusicLibraryOriginLabel(row.origin_country),
      activeStartYear: musicLibraryActiveStartYear(row.active_period),
      imageUrl: pickArtistPhotoUrl(row),
    };
    for (const key of musicLibraryArtistNameKeys(ref.displayName)) putRef(key, ref);
    const raw = (row.name ?? '').trim();
    if (raw) {
      for (const key of musicLibraryArtistNameKeys(raw)) putRef(key, ref);
    }
    const base = (row.name_base ?? '').trim();
    if (base) putRef(base.toLowerCase(), ref);
    for (const key of musicLibraryArtistSlugKeys(slug)) putRef(key, ref);
  };
  const queryBy = async (column: 'name' | 'music8_artist_slug', values: string[]) => {
    if (values.length === 0) return;
    const pending: Array<() => Promise<void>> = [];
    for (const chunk of chunkArray(values, ARTIST_NAME_LOOKUP_CHUNK)) {
      pending.push(async () => {
        const { data, error } = await admin.from('artists').select(select).in(column, chunk);
        if (error) {
          if (error.code === '42P01') return;
          if (error.code === '42703') {
            if (select.includes('image_url') || select.includes('spotify_artist_images')) {
              select = 'name, name_base, the_prefix, music8_artist_slug, origin_country, active_period';
            } else if (select.includes('active_period')) {
              select = 'name, name_base, the_prefix, music8_artist_slug';
            } else if (select.includes('the_prefix')) {
              select = 'name, music8_artist_slug';
            } else {
              return;
            }
            const retry = await admin.from('artists').select(select).in(column, chunk);
            if (retry.error) {
              if (retry.error.code === '42P01' || retry.error.code === '42703') return;
              throw new Error(retry.error.message);
            }
            for (const row of (retry.data ?? []) as Parameters<typeof remember>[0][]) remember(row);
            return;
          }
          throw new Error(error.message);
        }
        for (const row of (data ?? []) as Parameters<typeof remember>[0][]) remember(row);
      });
    }
    for (let i = 0; i < pending.length; i += ARTIST_NAME_LOOKUP_CONCURRENCY) {
      await Promise.all(pending.slice(i, i + ARTIST_NAME_LOOKUP_CONCURRENCY).map((fn) => fn()));
    }
  };
  await queryBy('name', queryNames);
  const slugs = [
    ...new Set(
      unique.map((n) => musicLibraryArtistSlugForName(n)).filter((s): s is string => Boolean(s)),
    ),
  ];
  await queryBy('music8_artist_slug', slugs);
  return out;
}

export function countMusicLibraryArtistsByLetter(items: { indexLetter: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const it of items) {
    const letter = musicLibraryArtistLetterParam(it.indexLetter);
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

/** A–Z 索引。公開一覧と同じ統合後の件数。 */
export async function fetchMusicLibraryArtistLetterCounts(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<Map<string, number>> {
  const { items } = await fetchMusicLibraryArtistIndex(admin, catalog);
  return countMusicLibraryArtistsByLetter(items);
}

export async function fetchMusicLibraryArtistIndex(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ letters: string[]; items: MusicLibraryArtistIndexEntry[] }> {
  const cached = resolvedArtistIndexCache.get(catalog);
  if (
    cached &&
    cached.gen === RESOLVED_ARTIST_INDEX_CACHE_GEN &&
    Date.now() - cached.at < RESOLVED_ARTIST_INDEX_TTL_MS
  ) {
    return cached.value;
  }
  await ensureWesternTreatedJpArtistCache(admin);
  const payload = await getLibraryArtistIndexCached(admin, catalog);
  const slugByName = await resolveArtistSlugsByNames(
    admin,
    payload.items.map((it) => it.main_artist),
  );
  const items: MusicLibraryArtistIndexEntry[] = [];
  for (const it of payload.items) {
    const resolved = lookupMusicLibraryArtistIndexRef(slugByName, it.main_artist);
    const slug = resolved?.slug ?? musicLibraryArtistSlugForName(it.main_artist);
    if (!slug) continue;
    const name = musicLibraryArtistIndexDisplayName({
      mainArtist: it.main_artist,
      slug,
      resolvedDisplayName: resolved?.displayName,
    });
    items.push({
      name,
      slug,
      href: musicLibraryArtistHref(slug),
      count: it.count,
      indexLetter: indexLetterForArtist(name),
      originLabel: resolved?.originLabel ?? null,
      activeStartYear: resolved?.activeStartYear ?? null,
      imageUrl: resolved?.imageUrl ?? null,
    });
  }
  const finalized = applyMusicLibraryArtistIndexSongCounts(
    finalizeMusicLibraryArtistIndexItems(items, payload.countsBySlug),
    payload.countsBySlug,
    payload.styleBySlug,
  );
  const letters = [...new Set(finalized.map((i) => musicLibraryArtistLetterParam(i.indexLetter)))].sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    if (a === '0-9') return 1;
    if (b === '0-9') return -1;
    return a.localeCompare(b, 'en');
  });
  const value = { letters, items: finalized };
  resolvedArtistIndexCache.set(catalog, { at: Date.now(), gen: RESOLVED_ARTIST_INDEX_CACHE_GEN, value });
  return value;
}

function pickMusicLibraryIndexDisplayName(a: string, b: string, slug: string): string {
  const aOk = musicLibraryNameMatchesArtistSlug(a, slug);
  const bOk = musicLibraryNameMatchesArtistSlug(b, slug);
  if (aOk && !bOk) return a;
  if (bOk && !aOk) return b;
  if (a.toLowerCase() === b.toLowerCase() && a !== b) {
    if (a === a.toLowerCase() && b !== b.toLowerCase()) return b;
    if (b === b.toLowerCase() && a !== a.toLowerCase()) return a;
  }
  return preferLibraryArtistDisplayName(a, b);
}

function uniqMusicLibrarySearchNames(names: Iterable<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const t = (raw ?? '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function musicLibraryArtistNicknameMergeKey(name: string, slug: string): string | null {
  const canonical =
    resolveArtistSearchNicknameCanonical(name) ||
    resolveArtistSearchNicknameCanonical(slug.replace(/-/g, ' '));
  if (!canonical) return null;
  const key = compactArtistSearchNicknameKey(canonical);
  return key || null;
}

function catalogCountForIndexSlug(
  slug: string,
  fallback: number,
  countsBySlug?: Record<string, number>,
): number {
  const n = countsBySlug?.[slug];
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return fallback;
}

function pickMergedNicknameIndexSlug(
  a: MusicLibraryArtistIndexEntry,
  b: MusicLibraryArtistIndexEntry,
  countsBySlug: Record<string, number> | undefined,
  canonical: string | null,
): string {
  const ca = catalogCountForIndexSlug(a.slug, a.count, countsBySlug);
  const cb = catalogCountForIndexSlug(b.slug, b.count, countsBySlug);
  if (cb > ca) return b.slug;
  if (ca > cb) return a.slug;
  const hasA = countsBySlug != null && Object.prototype.hasOwnProperty.call(countsBySlug, a.slug);
  const hasB = countsBySlug != null && Object.prototype.hasOwnProperty.call(countsBySlug, b.slug);
  if (hasB && !hasA) return b.slug;
  if (hasA && !hasB) return a.slug;
  if (canonical) {
    const generated = artistNameToMusic8Slug(canonical);
    if (generated && a.slug === generated && b.slug !== generated) return b.slug;
    if (generated && b.slug === generated && a.slug !== generated) return a.slug;
  }
  return a.slug;
}

function mergeNicknameIndexEntries(
  a: MusicLibraryArtistIndexEntry,
  b: MusicLibraryArtistIndexEntry,
  countsBySlug?: Record<string, number>,
): MusicLibraryArtistIndexEntry {
  const canonical =
    resolveArtistSearchNicknameCanonical(a.name) ||
    resolveArtistSearchNicknameCanonical(b.name) ||
    resolveArtistSearchNicknameCanonical(a.slug.replace(/-/g, ' ')) ||
    resolveArtistSearchNicknameCanonical(b.slug.replace(/-/g, ' '));
  const slug = pickMergedNicknameIndexSlug(a, b, countsBySlug, canonical);
  const fromSlug = slug === b.slug ? b : a;
  const other = slug === b.slug ? a : b;
  const name = canonical || pickMusicLibraryIndexDisplayName(fromSlug.name, other.name, slug);
  const searchNames = uniqMusicLibrarySearchNames([
    ...(a.searchNames ?? []),
    ...(b.searchNames ?? []),
    a.name,
    b.name,
    canonical,
  ]).filter((n) => n.toLowerCase() !== name.toLowerCase());
  return {
    ...fromSlug,
    ...other,
    slug,
    name,
    href: musicLibraryArtistHref(slug),
    count: Math.max(a.count, b.count),
    indexLetter: indexLetterForArtist(name),
    originLabel: a.originLabel || b.originLabel,
    activeStartYear: a.activeStartYear ?? b.activeStartYear,
    imageUrl: a.imageUrl || b.imageUrl,
    styleSlug: fromSlug.styleSlug || other.styleSlug,
    searchNames: searchNames.length > 0 ? searchNames : undefined,
  };
}

/** 愛称マスタで同一人物（5sos / 5 Seconds of Summer）なら1行にまとめる。 */
export function mergeMusicLibraryArtistIndexNicknameAliases(
  items: MusicLibraryArtistIndexEntry[],
  countsBySlug?: Record<string, number>,
): MusicLibraryArtistIndexEntry[] {
  const byKey = new Map<string, MusicLibraryArtistIndexEntry>();
  for (const it of items) {
    const nick = musicLibraryArtistNicknameMergeKey(it.name, it.slug);
    const key = nick ? `nick:${nick}` : `slug:${it.slug}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, it);
      continue;
    }
    byKey.set(key, mergeNicknameIndexEntries(existing, it, countsBySlug));
  }
  return [...byKey.values()];
}

/** 表示名の先頭文字で文字索引を振り直し、同じ slug は曲数を合算する。愛称も統合。 */
export function finalizeMusicLibraryArtistIndexItems(
  items: MusicLibraryArtistIndexEntry[],
  countsBySlug?: Record<string, number>,
): MusicLibraryArtistIndexEntry[] {
  const bySlug = new Map<string, MusicLibraryArtistIndexEntry>();
  for (const it of items) {
    const slug = it.slug.trim().toLowerCase();
    if (!slug) continue;
    const name = it.name.trim();
    if (!name) continue;
    const next: MusicLibraryArtistIndexEntry = {
      ...it,
      slug,
      name,
      href: musicLibraryArtistHref(slug),
      indexLetter: indexLetterForArtist(name),
    };
    const existing = bySlug.get(slug);
    if (!existing) {
      bySlug.set(slug, next);
      continue;
    }
    const mergedName = pickMusicLibraryIndexDisplayName(existing.name, next.name, slug);
    const searchNames = uniqMusicLibrarySearchNames([
      ...(existing.searchNames ?? []),
      ...(next.searchNames ?? []),
      existing.name,
      next.name,
    ]).filter((n) => n.toLowerCase() !== mergedName.toLowerCase());
    bySlug.set(slug, {
      ...existing,
      name: mergedName,
      count: existing.count + next.count,
      href: musicLibraryArtistHref(slug),
      indexLetter: indexLetterForArtist(mergedName),
      originLabel: existing.originLabel || next.originLabel,
      activeStartYear: existing.activeStartYear ?? next.activeStartYear,
      imageUrl: existing.imageUrl || next.imageUrl,
      searchNames: searchNames.length > 0 ? searchNames : undefined,
    });
  }
  return mergeMusicLibraryArtistIndexNicknameAliases([...bySlug.values()], countsBySlug);
}

/** 公開一覧の曲数を詳細ページと同じ `music8_artist_slug` 件数にする。最多スタイルも載せる。 */
export function applyMusicLibraryArtistIndexSongCounts(
  items: MusicLibraryArtistIndexEntry[],
  countsBySlug: Record<string, number> | undefined,
  styleBySlug?: Record<string, string>,
): MusicLibraryArtistIndexEntry[] {
  const out: MusicLibraryArtistIndexEntry[] = [];
  for (const it of items) {
    const n = countsBySlug?.[it.slug];
    let next = it;
    if (typeof n === 'number' && Number.isFinite(n)) {
      if (n <= 0) continue;
      next = { ...next, count: n };
    }
    const style = styleBySlug?.[it.slug]?.trim().toLowerCase();
    if (style) next = { ...next, styleSlug: style };
    out.push(next);
  }
  return out;
}

export function filterMusicLibraryArtistsByLetter(
  items: MusicLibraryArtistIndexEntry[],
  letterParam: string,
): MusicLibraryArtistIndexEntry[] {
  const want = musicLibraryArtistLetterParam(letterParam);
  return items.filter((it) => musicLibraryArtistLetterParam(indexLetterForArtist(it.name)) === want);
}

function musicLibraryArtistMatchesSearchNeedles(
  item: MusicLibraryArtistIndexEntry,
  needles: string[],
  mode: 'includes' | 'exact',
): boolean {
  const name = item.name.trim().toLowerCase();
  const slug = item.slug.trim().toLowerCase();
  const slugSpaced = slug.replace(/-/g, ' ');
  const aliases = (item.searchNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  for (const raw of needles) {
    const n = raw.trim().toLowerCase();
    if (!n) continue;
    if (mode === 'exact') {
      if (name === n || slug === n || slugSpaced === n) return true;
      if (aliases.some((a) => a === n)) return true;
      if (artistNamesMatchIgnoringLeadingArticle(item.name, raw)) return true;
      if (aliases.some((a) => artistNamesMatchIgnoringLeadingArticle(a, raw))) return true;
      continue;
    }
    if (name.includes(n) || slug.includes(n) || slugSpaced.includes(n)) return true;
    if (aliases.some((a) => a.includes(n))) return true;
    if (artistNamesMatchIgnoringLeadingArticle(item.name, raw)) return true;
    if (aliases.some((a) => artistNamesMatchIgnoringLeadingArticle(a, raw))) return true;
  }
  return false;
}

/** 索引をアーティスト名で絞る（愛称展開＋日本語名から解決した英語名）。 */
export function filterMusicLibraryArtistsBySearchQuery(
  items: MusicLibraryArtistIndexEntry[],
  rawQuery: string,
  extraNames: string[] = [],
): MusicLibraryArtistIndexEntry[] {
  const q = parseMusicLibraryArtistSearchQuery(rawQuery);
  if (!q) return [];
  const variants = [...new Set([...expandLibrarySearchQueryVariants(q), q].map((n) => n.trim()).filter(Boolean))];
  const extras = [...new Set(extraNames.map((n) => n.trim()).filter(Boolean))];
  return items.filter(
    (it) =>
      musicLibraryArtistMatchesSearchNeedles(it, variants, 'includes') ||
      musicLibraryArtistMatchesSearchNeedles(it, extras, 'exact'),
  );
}

export async function searchMusicLibraryArtistIndex(
  admin: SupabaseClient,
  items: MusicLibraryArtistIndexEntry[],
  rawQuery: string,
): Promise<MusicLibraryArtistIndexEntry[]> {
  const q = parseMusicLibraryArtistSearchQuery(rawQuery);
  if (!q) return [];
  let extra: string[] = [];
  if (q.length >= 2) {
    try {
      extra = await resolveMainArtistsForLibrarySearch(admin, q);
    } catch {
      extra = [];
    }
  }
  return filterMusicLibraryArtistsBySearchQuery(items, q, extra);
}

const ARTIST_SELECT =
  'id, name, name_ja, name_en, name_base, the_prefix, music8_artist_slug, kind, occupations, origin_country, active_period, members, youtube_channel_url, youtube_channel_id, spotify_artist_id, wikipedia_page, wikipedia_url, image_url, image_credit, spotify_artist_images, profile_text, description_en, birth_date, death_date';

const ARTIST_SELECT_NO_WIKI_URL =
  'id, name, name_ja, name_en, name_base, the_prefix, music8_artist_slug, kind, occupations, origin_country, active_period, members, youtube_channel_url, youtube_channel_id, spotify_artist_id, wikipedia_page, image_url, image_credit, spotify_artist_images, profile_text, description_en, birth_date, death_date';

const ARTIST_SELECT_MIN =
  'id, name, name_ja, music8_artist_slug, kind, origin_country, active_period, members, youtube_channel_url, image_url, image_credit, profile_text';

async function loadArtistRowsBySlug(admin: SupabaseClient, slug: string): Promise<ArtistRow[]> {
  for (const sel of [ARTIST_SELECT, ARTIST_SELECT_NO_WIKI_URL, ARTIST_SELECT_MIN]) {
    const { data, error } = await admin.from('artists').select(sel).eq('music8_artist_slug', slug).limit(5);
    if (!error) return (data ?? []) as unknown as ArtistRow[];
    if (error.code === '42P01') return [];
    if (error.code !== '42703') throw new Error(error.message);
  }
  return [];
}

type ArtistRow = {
  id: string;
  name: string | null;
  name_ja?: string | null;
  name_en?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
  music8_artist_slug?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
  origin_country?: string | null;
  active_period?: string | null;
  members?: string | null;
  youtube_channel_url?: string | null;
  youtube_channel_id?: string | null;
  spotify_artist_id?: string | null;
  wikipedia_page?: string | null;
  wikipedia_url?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  spotify_artist_images?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
};

function profileFromArtistRow(
  row: ArtistRow,
  fallbackName: string,
  slug: string,
  extraFallbacks: readonly string[] = [],
): MusicLibraryArtistProfile {
  const raw = musicLibraryArtistNameFromRow(row) || (row.name ?? '').trim() || fallbackName;
  const name = resolveMusicLibraryArtistDisplayName({
    name: raw,
    slug,
    fallbacks: [fallbackName, ...extraFallbacks],
  });
  const memberLinks: MusicLibraryArtistProfile['memberLinks'] = [];
  const bandLinks: MusicLibraryArtistProfile['bandLinks'] = [];
  const bornLabel = formatArtistBorn(row.birth_date, row.death_date).trim() || null;
  const diedRaw = formatArtistDied(row.death_date, row.birth_date).replace(/^永眠:\s*/, '').trim();
  const diedLabel = diedRaw || null;
  return {
    id: row.id,
    name,
    slug,
    nameJa: (row.name_ja ?? '').trim() || null,
    nameEn: (row.name_en ?? '').trim() || null,
    kind: (row.kind ?? '').trim() || null,
    occupation: formatMusicLibraryOccupation(row.kind, row.occupations),
    originCountry: (row.origin_country ?? '').trim() || null,
    originLabel: formatLibraryOriginCountry(row.origin_country),
    activePeriod: formatMusicLibraryActivePeriod(row.active_period),
    membersFallback: (row.members ?? '').trim() || null,
    imageUrl: pickArtistPhotoUrl(row),
    imageCredit: (row.image_credit ?? '').trim() || null,
    profileText: (row.profile_text ?? '').trim() || null,
    descriptionEn: (row.description_en ?? '').trim() || null,
    ageLabel: formatLibraryArtistAgeLabel(row.birth_date, row.death_date),
    bornLabel,
    diedLabel,
    links: buildLibraryArtistExternalLinks(row),
    memberLinks,
    bandLinks,
    showMembersLine: false,
  };
}

async function loadArtistRowByName(admin: SupabaseClient, name: string): Promise<ArtistRow | null> {
  const variants = libraryArtistNameLookupVariants(name);
  for (const sel of [ARTIST_SELECT, ARTIST_SELECT_NO_WIKI_URL, ARTIST_SELECT_MIN]) {
    for (const n of variants) {
      const { data, error } = await admin.from('artists').select(sel).ilike('name', n).limit(1);
      if (error) {
        if (error.code === '42P01') return null;
        if (error.code === '42703') break;
        throw new Error(error.message);
      }
      const row = ((data ?? []) as unknown as ArtistRow[])[0];
      if (row) return row;
    }
  }
  return null;
}

async function enrichMusicLibraryArtistProfile(
  admin: SupabaseClient,
  profile: MusicLibraryArtistProfile,
): Promise<MusicLibraryArtistProfile> {
  if (!profile.id) return profile;
  try {
    const graph = await loadArtistMemberGraph(admin, profile.id);
    return {
      ...profile,
      memberLinks: graph.members.map((m) => ({
        name: m.name,
        slug: musicLibraryArtistSlugForName(m.name, m.music8_artist_slug),
      })),
      bandLinks: graph.bands.map((m) => ({
        name: m.name,
        slug: musicLibraryArtistSlugForName(m.name, m.music8_artist_slug),
      })),
      showMembersLine: shouldShowArtistMembersLine({
        kind: profile.kind,
        memberLinkCount: graph.members.length,
        bandLinkCount: graph.bands.length,
        hasMembersFallback: Boolean(profile.membersFallback),
      }),
    };
  } catch (e) {
    console.warn('[music-library] artist_members', e);
    return profile;
  }
}

export async function fetchMusicLibraryArtistProfile(
  admin: SupabaseClient,
  input: { slug?: string | null; name?: string | null },
): Promise<MusicLibraryArtistProfile | null> {
  const slugIn = (input.slug ?? '').trim().toLowerCase();
  const nameIn = (input.name ?? '').trim();
  if ((!slugIn || isMusicLibraryReservedSlug(slugIn)) && !nameIn) return null;

  let row: ArtistRow | null = null;
  if (slugIn && !isMusicLibraryReservedSlug(slugIn)) {
    row = (await loadArtistRowsBySlug(admin, slugIn))[0] ?? null;
  }
  if (!row && nameIn) {
    row = await loadArtistRowByName(admin, nameIn);
  }
  if (!row) return null;

  const display = musicLibraryArtistNameFromRow(row) || (row.name ?? '').trim() || nameIn;
  const slug =
    musicLibraryArtistSlugForName(display, row.music8_artist_slug) ||
    slugIn ||
    artistNameToMusic8Slug(display);
  if (!slug) return null;
  const profile = profileFromArtistRow(row, display, slug);
  return enrichMusicLibraryArtistProfile(admin, profile);
}

export async function fetchMusicLibraryArtistPage(
  admin: SupabaseClient,
  artistSlug: string,
  page: number,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{
  profile: MusicLibraryArtistProfile;
  cards: MusicLibrarySongCard[];
  charts: MusicLibraryArtistCharts;
  page: number;
  totalPages: number;
  totalItems: number;
} | null> {
  const slug = artistSlug.trim().toLowerCase();
  if (!slug || isMusicLibraryReservedSlug(slug)) return null;
  await ensureWesternTreatedJpArtistCache(admin);

  const artistRow = (await loadArtistRowsBySlug(admin, slug))[0] ?? null;

  const { data: bySlug, error: songErr } = await admin
    .from('songs')
    .select(SONG_LIST_SELECT)
    .eq('music8_artist_slug', slug)
    .limit(800);
  if (songErr) throw new Error(songErr.message);

  let rows = filterSongRowsByLibraryCatalog((bySlug ?? []) as SongListRow[], catalog);

  if (rows.length === 0 && artistRow) {
    const display = musicLibraryArtistNameFromRow(artistRow) || (artistRow.name ?? '').trim();
    const namesToTry = [
      ...new Set(
        [display, (artistRow.name ?? '').trim(), ...libraryArtistNameLookupVariants(display)].filter(Boolean),
      ),
    ];
    for (const n of namesToTry) {
      if (rows.length > 0) break;
      const { data: byName, error: nameErr } = await admin
        .from('songs')
        .select(SONG_LIST_SELECT)
        .ilike('main_artist', n)
        .limit(800);
      if (nameErr) throw new Error(nameErr.message);
      rows = filterSongRowsByLibraryCatalog((byName ?? []) as SongListRow[], catalog);
    }
  }

  if (rows.length === 0 && !artistRow) return null;

  rows = sortMusicLibrarySongs(rows);
  const songArtistNames = rows.map((r) => artistNameOf(r));
  const fallbackName = artistRow
    ? musicLibraryArtistNameFromRow(artistRow) || artistRow.name || slug
    : artistNameOf(rows[0]!);
  let profile: MusicLibraryArtistProfile = artistRow
    ? profileFromArtistRow(artistRow, fallbackName, slug, songArtistNames)
    : emptyMusicLibraryArtistProfile(
        resolveMusicLibraryArtistDisplayName({
          name: fallbackName,
          slug,
          fallbacks: songArtistNames,
        }),
        slug,
      );

  if (profile.id) {
    try {
      const graph = await loadArtistMemberGraph(admin, profile.id);
      profile = {
        ...profile,
        memberLinks: graph.members.map((m) => ({
          name: m.name,
          slug: musicLibraryArtistSlugForName(m.name, m.music8_artist_slug),
        })),
        bandLinks: graph.bands.map((m) => ({
          name: m.name,
          slug: musicLibraryArtistSlugForName(m.name, m.music8_artist_slug),
        })),
        showMembersLine: shouldShowArtistMembersLine({
          kind: profile.kind,
          memberLinkCount: graph.members.length,
          bandLinkCount: graph.bands.length,
          hasMembersFallback: Boolean(profile.membersFallback),
        }),
      };
    } catch (e) {
      console.warn('[music-library] artist_members', e);
    }
  }

  const sliced = sliceMusicLibraryPage(rows, page, MUSIC_LIBRARY_PAGE_SIZE);
  const { cards } = await attachVideosToSongs(admin, sliced.items);
  return {
    profile,
    cards,
    charts: buildMusicLibraryArtistCharts(rows),
    page: sliced.page,
    totalPages: sliced.totalPages,
    totalItems: sliced.totalItems,
  };
}

export async function fetchMusicLibrarySongDetail(
  admin: SupabaseClient,
  artistSlug: string,
  songSlug: string,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<MusicLibrarySongDetail | null> {
  const a = artistSlug.trim().toLowerCase();
  const s = songSlug.trim().toLowerCase();
  if (!a || !s || isMusicLibraryReservedSlug(a)) return null;
  await ensureWesternTreatedJpArtistCache(admin);

  const select = SONG_LIST_SELECT;
  const { data, error } = await admin
    .from('songs')
    .select(select)
    .eq('music8_artist_slug', a)
    .eq('music8_song_slug', s)
    .limit(5);
  if (error) throw new Error(error.message);
  const filtered = filterSongRowsByLibraryCatalog(
    (data ?? []) as (SongListRow & { music8_intro?: string | null })[],
    catalog,
  );
  const row = filtered[0];
  if (!row) return null;

  const { cards } = await attachVideosToSongs(admin, [row]);
  const card = cards[0];
  if (!card) return null;

  const credits: MusicLibrarySongDetail['credits'] = [];
  const creditSelect = 'display_order, role, artists(name, name_base, the_prefix, music8_artist_slug)';
  const { data: creditRows, error: credErr } = await admin
    .from('song_credits')
    .select(creditSelect)
    .eq('song_id', row.id)
    .order('display_order', { ascending: true });
  const creditData = !credErr
    ? creditRows
    : credErr.code === '42703'
      ? (
          await admin
            .from('song_credits')
            .select('display_order, role, artists(name, music8_artist_slug)')
            .eq('song_id', row.id)
            .order('display_order', { ascending: true })
        ).data
      : null;
  if (Array.isArray(creditData)) {
    for (const raw of creditData) {
      const nested = (raw as { artists?: ArtistJoinRow | ArtistJoinRow[] }).artists;
      const artist = creditArtistFromJoin(nested);
      if (!artist) continue;
      credits.push({ name: artist.name, slug: artist.slug, href: artist.href });
    }
  }
  if (credits.length === 0 && card.artistName) {
    credits.push({
      name: card.artistName,
      slug: card.artistSlug,
      href: card.artistHref,
    });
  }

  const intro = usableLibraryMusic8Intro((row as { music8_intro?: string | null }).music8_intro);
  const vocal = formatLibraryVocalDisplay(row.vocal);
  const styleLabel = (row.style ?? '').trim() || null;

  return {
    ...card,
    intro,
    vocal,
    styleLabel,
    credits,
  };
}
