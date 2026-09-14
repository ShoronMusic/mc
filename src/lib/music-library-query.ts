/**
 * Music Library 公開カタログの DB 取得。
 * 仕様: docs/00-music-library-spec.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { indexLetterForArtist } from '@/lib/admin-library-index';
import { loadArtistMemberGraph, shouldShowArtistMembersLine } from '@/lib/artist-members';
import { getLibraryArtistIndexCached } from '@/lib/build-library-artist-index';
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
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import {
  formatMusicLibraryOriginLabel,
  musicLibraryVocalLabels,
  parseMusicLibrarySnapshotArtists,
  pickMusicLibraryGenreLabel,
} from '@/lib/music-library-labels';
import { extractMusic8SongFieldsFromPersistedSnapshot } from '@/lib/music8-song-fields';
import { usableLibraryMusic8Intro } from '@/lib/library-song-commentary-text';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';
import {
  MUSIC8_NAV_STYLE_LABELS,
  MUSIC8_NAV_STYLE_SLUGS,
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
  MUSIC_LIBRARY_PAGE_SIZE,
  MUSIC_LIBRARY_TOP_PER_STYLE,
  isMusicLibraryReservedSlug,
  musicLibraryArtistHref,
  musicLibraryArtistLetterParam,
  musicLibrarySongHref,
  musicLibraryTotalPages,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
} from '@/lib/music-library-urls';
import { type MusicLibraryListArtist, type MusicLibrarySongCard } from '@/lib/music-library-types';

export type { MusicLibrarySongCard } from '@/lib/music-library-types';
export { musicLibraryPlayableTracks } from '@/lib/music-library-types';

const STYLE_CACHE_TTL_MS = 2 * 60 * 1000;
const SONG_ID_CHUNK = 80;
const VIDEO_CHUNK = 80;

const SONG_LIST_SELECT =
  'id, main_artist, song_title, display_title, original_release_date, catalog_scope, music8_artist_slug, music8_song_slug, spotify_images, music8_song_data, catalog_published_at, style, vocal, genres, music8_video_id, primary_artist_name_ja';

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
};

export type MusicLibraryArtistProfile = {
  id: string | null;
  name: string;
  slug: string;
  nameJa: string | null;
  kind: string | null;
  originCountry: string | null;
  originLabel: string | null;
  activePeriod: string | null;
  membersFallback: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  profileText: string | null;
  ageLabel: string | null;
  links: ReturnType<typeof buildLibraryArtistExternalLinks>;
  memberLinks: { name: string; slug: string | null }[];
  bandLinks: { name: string; slug: string | null }[];
  showMembersLine: boolean;
};

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
  const genreLabel = pickMusicLibraryGenreLabel({
    columnGenres: row.genres,
    snapshotGenres: snap?.genres ?? null,
  });
  const artists = resolveMusicLibraryListArtists({
    artistName,
    artistSlug,
    snapshotArtists: parseMusicLibrarySnapshotArtists(row.music8_song_data),
  });
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
    styleSlug: styleSlug ?? music8NavStyleSlugFromName(row.style ?? '') ?? null,
    vocalLabels,
    genreLabel,
    artists,
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
  return { cards: withArtists, youtubeBySong };
}

type ArtistOriginRow = {
  music8_artist_slug?: string | null;
  name?: string | null;
  origin_country?: string | null;
};

type SongCreditJoinRow = {
  song_id?: string | null;
  display_order?: number | null;
  artists?:
    | { name?: string | null; music8_artist_slug?: string | null; origin_country?: string | null }
    | { name?: string | null; music8_artist_slug?: string | null; origin_country?: string | null }[]
    | null;
};

function creditArtistFromJoin(
  nested:
    | { name?: string | null; music8_artist_slug?: string | null; origin_country?: string | null }
    | { name?: string | null; music8_artist_slug?: string | null; origin_country?: string | null }[]
    | null
    | undefined,
): MusicLibraryListArtist | null {
  const artist = Array.isArray(nested) ? nested[0] : nested;
  const name = (artist?.name ?? '').trim();
  if (!name) return null;
  return toListArtist(name, artist?.music8_artist_slug, artist?.origin_country);
}

async function fetchMusicLibraryCreditArtists(
  admin: SupabaseClient,
  songIds: string[],
): Promise<Map<string, MusicLibraryListArtist[]>> {
  const bySong = new Map<string, MusicLibraryListArtist[]>();
  if (songIds.length === 0) return bySong;
  for (const chunk of chunkArray([...new Set(songIds)], SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('song_credits')
      .select('song_id, display_order, artists(name, music8_artist_slug, origin_country)')
      .in('song_id', chunk)
      .order('display_order', { ascending: true });
    if (error) {
      if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') return bySong;
      throw new Error(error.message);
    }
    const rows = [...((data ?? []) as SongCreditJoinRow[])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    for (const row of rows) {
      const songId = (row.song_id ?? '').trim();
      const artist = creditArtistFromJoin(row.artists);
      if (!songId || !artist) continue;
      const list = bySong.get(songId) ?? [];
      if (!list.some((x) => x.name.toLowerCase() === artist.name.toLowerCase())) list.push(artist);
      bySong.set(songId, list);
    }
  }
  return bySong;
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
  const remember = (row: ArtistOriginRow) => {
    const origin = formatMusicLibraryOriginLabel(row.origin_country);
    if (!origin) return;
    const slug = (row.music8_artist_slug ?? '').trim().toLowerCase();
    const name = (row.name ?? '').trim().toLowerCase();
    if (slug) originBySlug.set(slug, origin);
    if (name) originByName.set(name, origin);
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
        .filter((a) => !a.originLabel && a.slug)
        .map((a) => a.slug!.toLowerCase()),
    ),
  ];
  for (const chunk of chunkArray(missingSlugs, SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('artists')
      .select('music8_artist_slug, name, origin_country')
      .in('music8_artist_slug', chunk);
    if (error) {
      if (error.code === '42P01' || error.code === '42703') break;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as ArtistOriginRow[]) remember(row);
  }

  const missingNames = [
    ...new Set(
      withArtists
        .flatMap((c) => c.artists ?? [])
        .filter((a) => {
          const slug = (a.slug ?? '').toLowerCase();
          if (a.originLabel) return false;
          if (slug && originBySlug.has(slug)) return false;
          return Boolean(a.name.trim());
        })
        .map((a) => a.name.trim()),
    ),
  ];
  for (const chunk of chunkArray(missingNames, SONG_ID_CHUNK)) {
    const { data, error } = await admin
      .from('artists')
      .select('music8_artist_slug, name, origin_country')
      .in('name', chunk);
    if (error) {
      if (error.code === '42P01' || error.code === '42703') break;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as ArtistOriginRow[]) remember(row);
  }

  return withArtists.map((card) => {
    const artists = (card.artists ?? []).map((artist) => {
      if (artist.originLabel) return artist;
      const origin =
        originBySlug.get((artist.slug ?? '').toLowerCase()) ??
        originByName.get(artist.name.trim().toLowerCase()) ??
        null;
      return origin ? { ...artist, originLabel: origin } : artist;
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
  const rows = sortMusicLibrarySongs(filterSongRowsByLibraryCatalog(raw, catalog));
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
  const rows = (data ?? []) as unknown as SongListRow[];
  return filterSongRowsByLibraryCatalog(rows, catalog);
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
      cards: cards.map((c) => ({ ...c, styleSlug: slug })),
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
    cards: cards.map((c) => ({ ...c, styleSlug: slug })),
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
      return [slug, cards.map((c) => ({ ...c, styleSlug: slug }))] as const;
    }),
  );
  const byStyle = new Map<string, MusicLibrarySongCard[]>();
  for (const [slug, cards] of pairs) byStyle.set(slug, cards);
  return takeNewestPerStyle(byStyle, MUSIC_LIBRARY_TOP_PER_STYLE);
}

async function resolveArtistSlugsByNames(
  admin: SupabaseClient,
  names: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const chunk of chunkArray(unique, 80)) {
    const { data, error } = await admin
      .from('artists')
      .select('name, music8_artist_slug')
      .in('name', chunk);
    if (error) {
      if (error.code === '42P01') break;
      throw new Error(error.message);
    }
    for (const row of (data ?? []) as { name?: string | null; music8_artist_slug?: string | null }[]) {
      const name = (row.name ?? '').trim();
      const slug = musicLibraryArtistSlugForName(name, row.music8_artist_slug);
      if (name && slug) out.set(name.toLowerCase(), slug);
    }
  }
  return out;
}

export async function fetchMusicLibraryArtistIndex(
  admin: SupabaseClient,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{ letters: string[]; items: MusicLibraryArtistIndexEntry[] }> {
  await ensureWesternTreatedJpArtistCache(admin);
  const payload = await getLibraryArtistIndexCached(admin, catalog);
  const slugByName = await resolveArtistSlugsByNames(
    admin,
    payload.items.map((it) => it.main_artist),
  );
  const items: MusicLibraryArtistIndexEntry[] = [];
  for (const it of payload.items) {
    const slug =
      slugByName.get(it.main_artist.trim().toLowerCase()) ??
      musicLibraryArtistSlugForName(it.main_artist);
    if (!slug) continue;
    items.push({
      name: it.main_artist,
      slug,
      href: musicLibraryArtistHref(slug),
      count: it.count,
      indexLetter: it.indexLetter || indexLetterForArtist(it.main_artist),
    });
  }
  const letters = [...new Set(items.map((i) => musicLibraryArtistLetterParam(i.indexLetter)))].sort((a, b) => {
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    return a.localeCompare(b, 'en');
  });
  return { letters, items };
}

export function filterMusicLibraryArtistsByLetter(
  items: MusicLibraryArtistIndexEntry[],
  letterParam: string,
): MusicLibraryArtistIndexEntry[] {
  const want = musicLibraryArtistLetterParam(letterParam);
  return items.filter((it) => musicLibraryArtistLetterParam(it.indexLetter) === want);
}

const ARTIST_SELECT =
  'id, name, name_ja, name_base, the_prefix, music8_artist_slug, kind, origin_country, active_period, members, youtube_channel_url, youtube_channel_id, spotify_artist_id, wikipedia_page, image_url, image_credit, profile_text, birth_date, death_date';

const ARTIST_SELECT_MIN =
  'id, name, name_ja, music8_artist_slug, kind, origin_country, active_period, members, youtube_channel_url, image_url, image_credit, profile_text';

async function loadArtistRowsBySlug(admin: SupabaseClient, slug: string): Promise<ArtistRow[]> {
  for (const sel of [ARTIST_SELECT, ARTIST_SELECT_MIN]) {
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
  name_base?: string | null;
  the_prefix?: string | null;
  music8_artist_slug?: string | null;
  kind?: string | null;
  origin_country?: string | null;
  active_period?: string | null;
  members?: string | null;
  youtube_channel_url?: string | null;
  youtube_channel_id?: string | null;
  spotify_artist_id?: string | null;
  wikipedia_page?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  profile_text?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
};

function profileFromArtistRow(row: ArtistRow, fallbackName: string, slug: string): MusicLibraryArtistProfile {
  const name = displayNameFromArtistRow(row) || (row.name ?? '').trim() || fallbackName;
  const memberLinks: MusicLibraryArtistProfile['memberLinks'] = [];
  const bandLinks: MusicLibraryArtistProfile['bandLinks'] = [];
  return {
    id: row.id,
    name,
    slug,
    nameJa: (row.name_ja ?? '').trim() || null,
    kind: (row.kind ?? '').trim() || null,
    originCountry: (row.origin_country ?? '').trim() || null,
    originLabel: formatLibraryOriginCountry(row.origin_country),
    activePeriod: (row.active_period ?? '').trim() || null,
    membersFallback: (row.members ?? '').trim() || null,
    imageUrl: (row.image_url ?? '').trim() || null,
    imageCredit: (row.image_credit ?? '').trim() || null,
    profileText: (row.profile_text ?? '').trim() || null,
    ageLabel: formatLibraryArtistAgeLabel(row.birth_date, row.death_date),
    links: buildLibraryArtistExternalLinks(row),
    memberLinks,
    bandLinks,
    showMembersLine: false,
  };
}

export async function fetchMusicLibraryArtistPage(
  admin: SupabaseClient,
  artistSlug: string,
  page: number,
  catalog: LibraryCatalogFilter = musicLibraryCatalogFilter(),
): Promise<{
  profile: MusicLibraryArtistProfile;
  cards: MusicLibrarySongCard[];
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

  if (rows.length === 0 && artistRow?.name) {
    const { data: byName, error: nameErr } = await admin
      .from('songs')
      .select(SONG_LIST_SELECT)
      .ilike('main_artist', artistRow.name)
      .limit(800);
    if (nameErr) throw new Error(nameErr.message);
    rows = filterSongRowsByLibraryCatalog((byName ?? []) as SongListRow[], catalog);
  }

  if (rows.length === 0 && !artistRow) return null;

  rows = sortMusicLibrarySongs(rows);
  const fallbackName = artistRow ? displayNameFromArtistRow(artistRow) || artistRow.name || slug : artistNameOf(rows[0]!);
  let profile: MusicLibraryArtistProfile = artistRow
    ? profileFromArtistRow(artistRow, fallbackName, slug)
    : {
        id: null,
        name: fallbackName,
        slug,
        nameJa: null,
        kind: null,
        originCountry: null,
        originLabel: null,
        activePeriod: null,
        membersFallback: null,
        imageUrl: null,
        imageCredit: null,
        profileText: null,
        ageLabel: null,
        links: { youtube: null, spotify: null, wikipedia: null },
        memberLinks: [],
        bandLinks: [],
        showMembersLine: false,
      };

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

  const select = `${SONG_LIST_SELECT}, music8_intro`;
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
  const { data: creditRows, error: credErr } = await admin
    .from('song_credits')
    .select('display_order, role, artists(name, music8_artist_slug)')
    .eq('song_id', row.id)
    .order('display_order', { ascending: true });
  if (!credErr && Array.isArray(creditRows)) {
    for (const raw of creditRows) {
      const nested = (raw as { artists?: { name?: string | null; music8_artist_slug?: string | null } | { name?: string | null; music8_artist_slug?: string | null }[] }).artists;
      const artist = Array.isArray(nested) ? nested[0] : nested;
      const name = (artist?.name ?? '').trim();
      if (!name) continue;
      const slug = musicLibraryArtistSlugForName(name, artist?.music8_artist_slug);
      credits.push({ name, slug, href: slug ? musicLibraryArtistHref(slug) : null });
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
