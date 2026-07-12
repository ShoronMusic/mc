/**
 * 邦楽曲向け Spotify track ID / popularity 一括補完（管理画面 dry-run → apply）。
 * 既存 spotify_track_id は上書きしない。曖昧マッチは song_spotify_review_queue へ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSongsForLibraryArtistSelection } from '@/lib/library-search-query';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
} from '@/lib/song-credits-sync';
import { resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
import { normalizeSongCatalogScope } from '@/lib/song-catalog-scope';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackById,
  getSpotifyAccessToken,
  searchSpotifyTrackCandidatesByArtistTitle,
  type SpotifyTrackWithArtists,
} from '@/lib/spotify-search-track';
import {
  pickBestSpotifyCandidate,
  type SpotifyArtistMatchOptions,
  type SpotifyTrackCandidate,
} from '@/lib/spotify-track-match';
import {
  ensureWesternTreatedJpArtistCache,
  librarySongRowMatchesWesternTreatedJpArtist,
} from '@/lib/western-treated-jp-artists';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DOMESTIC_SPOTIFY_ENRICH_DEFAULT_LIMIT = 30;
export const DOMESTIC_SPOTIFY_ENRICH_MAX_LIMIT = 50;
export const DOMESTIC_SPOTIFY_ENRICH_DELAY_MS = 400;

const SONG_SELECT =
  'id, display_title, main_artist, song_title, catalog_scope, music8_artist_slug, primary_artist_name_ja, spotify_track_id, spotify_popularity, spotify_name, spotify_artists, spotify_release_date, spotify_images';

export type DomesticSpotifySongRow = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  catalog_scope?: string | null;
  music8_artist_slug?: string | null;
  primary_artist_name_ja?: string | null;
  spotify_track_id?: string | null;
  spotify_popularity?: number | null;
  spotify_name?: string | null;
  spotify_artists?: string | null;
  spotify_release_date?: string | null;
  spotify_images?: string | null;
};

export type DomesticSpotifyEnrichStatus =
  | 'would_update'
  | 'would_review'
  | 'updated'
  | 'queued_review'
  | 'skipped_not_domestic'
  | 'skipped_western_treated'
  | 'skipped_complete'
  | 'skipped_no_match'
  | 'skipped_missing_meta'
  | 'skipped_no_token'
  | 'error';

export type DomesticSpotifyEnrichResult = {
  songId: string;
  displayTitle: string | null;
  mainArtist: string | null;
  songTitle: string | null;
  status: DomesticSpotifyEnrichStatus;
  reason?: string;
  spotifyTrackId?: string | null;
  spotifyPopularity?: number | null;
  message?: string;
};

export type DomesticSpotifyEnrichSummary = {
  requested: number;
  targets: number;
  wouldUpdate: number;
  wouldReview: number;
  updated: number;
  queuedReview: number;
  skippedNotDomestic: number;
  skippedWesternTreated: number;
  skippedComplete: number;
  skippedNoMatch: number;
  skippedMissingMeta: number;
  skippedNoToken: number;
  errors: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyStr(v: string | null | undefined): boolean {
  return !v?.trim();
}

/** track ID または popularity が空なら補完対象候補（スコープ判定前） */
export function songNeedsSpotifyFields(row: {
  spotify_track_id?: string | null;
  spotify_popularity?: number | null;
}): boolean {
  const hasId = Boolean(row.spotify_track_id?.trim());
  const hasPop =
    row.spotify_popularity != null && Number.isFinite(Number(row.spotify_popularity));
  return !hasId || !hasPop;
}

/**
 * 邦楽 Spotify 一括の対象か（純関数・western-treated キーキャッシュ前提）。
 * - catalog_scope === domestic
 * - western_treated_jp_artists に該当しない
 * - spotify_track_id 空 または spotify_popularity 空
 */
export function isDomesticSpotifyEnrichTarget(row: DomesticSpotifySongRow): boolean {
  if (librarySongRowMatchesWesternTreatedJpArtist(row)) return false;
  if (normalizeSongCatalogScope(row.catalog_scope) !== 'domestic') return false;
  return songNeedsSpotifyFields(row);
}

export function filterDomesticSpotifyEnrichTargets<T extends DomesticSpotifySongRow>(
  rows: T[],
): T[] {
  return rows.filter(isDomesticSpotifyEnrichTarget);
}

export function clampDomesticSpotifyEnrichLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DOMESTIC_SPOTIFY_ENRICH_DEFAULT_LIMIT;
  return Math.max(1, Math.min(DOMESTIC_SPOTIFY_ENRICH_MAX_LIMIT, Math.floor(n)));
}

function emptySummary(): DomesticSpotifyEnrichSummary {
  return {
    requested: 0,
    targets: 0,
    wouldUpdate: 0,
    wouldReview: 0,
    updated: 0,
    queuedReview: 0,
    skippedNotDomestic: 0,
    skippedWesternTreated: 0,
    skippedComplete: 0,
    skippedNoMatch: 0,
    skippedMissingMeta: 0,
    skippedNoToken: 0,
    errors: 0,
  };
}

function bumpSummary(summary: DomesticSpotifyEnrichSummary, status: DomesticSpotifyEnrichStatus): void {
  switch (status) {
    case 'would_update':
      summary.wouldUpdate += 1;
      break;
    case 'would_review':
      summary.wouldReview += 1;
      break;
    case 'updated':
      summary.updated += 1;
      break;
    case 'queued_review':
      summary.queuedReview += 1;
      break;
    case 'skipped_not_domestic':
      summary.skippedNotDomestic += 1;
      break;
    case 'skipped_western_treated':
      summary.skippedWesternTreated += 1;
      break;
    case 'skipped_complete':
      summary.skippedComplete += 1;
      break;
    case 'skipped_no_match':
      summary.skippedNoMatch += 1;
      break;
    case 'skipped_missing_meta':
      summary.skippedMissingMeta += 1;
      break;
    case 'skipped_no_token':
      summary.skippedNoToken += 1;
      break;
    case 'error':
      summary.errors += 1;
      break;
  }
}

function classifySkip(
  row: DomesticSpotifySongRow,
  ignoreCatalogFilter = false,
): DomesticSpotifyEnrichStatus | null {
  if (!ignoreCatalogFilter) {
    if (librarySongRowMatchesWesternTreatedJpArtist(row)) return 'skipped_western_treated';
    if (normalizeSongCatalogScope(row.catalog_scope) !== 'domestic') return 'skipped_not_domestic';
  }
  if (!songNeedsSpotifyFields(row)) return 'skipped_complete';
  return null;
}

function buildEmptyFillPayload(
  row: DomesticSpotifySongRow,
  meta: {
    spotifyTrackId: string | null;
    spotifyPopularity: number | null;
    spotifyName: string | null;
    spotifyArtists: string | null;
    spotifyReleaseDate: string | null;
    spotifyImages: string | null;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const existingId = row.spotify_track_id?.trim();
  if (!existingId && meta.spotifyTrackId?.trim()) {
    payload.spotify_track_id = meta.spotifyTrackId.trim();
  }
  if (
    (row.spotify_popularity == null || !Number.isFinite(Number(row.spotify_popularity))) &&
    meta.spotifyPopularity != null &&
    Number.isFinite(meta.spotifyPopularity)
  ) {
    payload.spotify_popularity = Math.max(0, Math.min(100, Math.round(meta.spotifyPopularity)));
  }
  if (emptyStr(row.spotify_name) && meta.spotifyName?.trim()) {
    payload.spotify_name = meta.spotifyName.trim();
  }
  if (emptyStr(row.spotify_artists) && meta.spotifyArtists?.trim()) {
    payload.spotify_artists = meta.spotifyArtists.trim();
  }
  if (emptyStr(row.spotify_release_date) && meta.spotifyReleaseDate?.trim()) {
    payload.spotify_release_date = meta.spotifyReleaseDate.trim();
  }
  if (emptyStr(row.spotify_images) && meta.spotifyImages?.trim()) {
    payload.spotify_images = meta.spotifyImages.trim();
  }
  return payload;
}

async function ensureSpotifyArtistsInDb(
  admin: SupabaseClient,
  artistRefs: { id: string; name: string }[],
): Promise<void> {
  if (artistRefs.length === 0) return;
  const details = await fetchSpotifyArtistsByIds(artistRefs.map((a) => a.id));
  const detailById = new Map(details.map((d) => [d.id, d]));
  const index = await loadArtistLookupIndex(admin);

  for (const ref of artistRefs) {
    const detail = detailById.get(ref.id) ?? {
      id: ref.id,
      name: ref.name,
      popularity: null,
      images: null,
    };
    if (resolveArtistIdFromIndex(index, detail.name, null)) continue;

    const payload: Record<string, unknown> = {
      name: detail.name,
      spotify_artist_id: detail.id,
    };
    if (detail.images) payload.spotify_artist_images = detail.images;
    if (detail.popularity != null) payload.spotify_artist_popularity = detail.popularity;

    const { error } = await admin.from('artists').insert(payload);
    if (error?.code !== '23505' && error && error.code !== '42703' && error.code !== '42P01') {
      console.warn('[admin-domestic-spotify-enrich] artist insert', error.message);
    }
  }
  clearArtistLookupIndexCache();
}

async function insertReviewQueue(
  admin: SupabaseClient,
  row: {
    songId: string;
    displayTitle: string | null;
    mainArtist: string | null;
    songTitle: string | null;
    spotifySearchQuery: string;
    candidate: SpotifyTrackCandidate;
    candidateRank: number;
    reason: string;
  },
): Promise<void> {
  const payload = {
    song_id: row.songId,
    display_title: row.displayTitle,
    main_artist: row.mainArtist,
    song_title: row.songTitle,
    spotify_search_query: row.spotifySearchQuery,
    candidate_rank: row.candidateRank,
    spotify_track_id: row.candidate.spotifyTrackId,
    spotify_name: row.candidate.spotifyName,
    spotify_artists: row.candidate.spotifyArtists,
    reason: row.reason,
  };
  const { error } = await admin.from('song_spotify_review_queue').insert(payload);
  if (error?.code === '42P01' || error?.code === '42703') {
    console.warn('[admin-domestic-spotify-enrich] review queue table missing');
    return;
  }
  if (error) {
    console.warn('[admin-domestic-spotify-enrich] review insert', error.message);
  }
}

async function fetchSongsByIds(
  admin: SupabaseClient,
  songIds: string[],
): Promise<DomesticSpotifySongRow[]> {
  const ids = [...new Set(songIds.map((id) => id.trim()).filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) return [];

  const out: DomesticSpotifySongRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await admin.from('songs').select(SONG_SELECT).in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      out.push(row as DomesticSpotifySongRow);
    }
  }
  return out;
}

async function fetchSongsByArtistName(
  admin: SupabaseClient,
  artistName: string,
  fetchLimit: number,
): Promise<DomesticSpotifySongRow[]> {
  const rows = await fetchSongsForLibraryArtistSelection<DomesticSpotifySongRow>(
    admin,
    artistName.trim(),
    SONG_SELECT,
    Math.max(fetchLimit, 100),
    'indexed_pick',
  );
  return rows;
}

async function resolveArtistSpotifyMatchHints(
  admin: SupabaseClient,
  mainArtist: string,
): Promise<SpotifyArtistMatchOptions & { searchArtistName: string }> {
  const name = mainArtist.split(',')[0]?.trim() || mainArtist.trim();
  const alternateArtistNames: string[] = [];
  const expectedSpotifyArtistIds: string[] = [];
  let searchArtistName = name;

  if (!name) {
    return { alternateArtistNames, expectedSpotifyArtistIds, searchArtistName };
  }

  const esc = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const primary = await admin
    .from('artists')
    .select('name, name_en, name_ja, spotify_artist_id')
    .or(`name.eq."${esc}",name_en.eq."${esc}",name_ja.eq."${esc}"`)
    .limit(5);

  let rows = primary.data;
  if (primary.error?.code === '42703' || (primary.error && !rows)) {
    const fallback = await admin
      .from('artists')
      .select('name, name_en, spotify_artist_id')
      .or(`name.eq."${esc}",name_en.eq."${esc}"`)
      .limit(5);
    if (!fallback.error) rows = fallback.data;
  } else if (primary.error) {
    console.warn('[admin-domestic-spotify-enrich] artist hints', primary.error.message);
  }

  for (const row of (rows ?? []) as Array<{
    name?: string | null;
    name_en?: string | null;
    name_ja?: string | null;
    spotify_artist_id?: string | null;
  }>) {
    if (row.name?.trim()) alternateArtistNames.push(row.name.trim());
    if (row.name_en?.trim()) {
      alternateArtistNames.push(row.name_en.trim());
      if (/[A-Za-z]/.test(row.name_en)) searchArtistName = row.name_en.trim();
    }
    if (row.name_ja?.trim()) alternateArtistNames.push(row.name_ja.trim());
    if (row.spotify_artist_id?.trim()) {
      expectedSpotifyArtistIds.push(row.spotify_artist_id.trim());
    }
  }

  // name_en が空でも spotify_artist_id があれば Spotify から英語表記を取って検索・照合に使う
  if (
    expectedSpotifyArtistIds.length > 0 &&
    !/[A-Za-z]/.test(searchArtistName)
  ) {
    try {
      const metas = await fetchSpotifyArtistsByIds(expectedSpotifyArtistIds.slice(0, 1));
      const spName = metas[0]?.name?.trim();
      if (spName) {
        searchArtistName = spName;
        alternateArtistNames.push(spName);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    alternateArtistNames: [...new Set(alternateArtistNames.filter((n) => n !== name))],
    expectedSpotifyArtistIds: [...new Set(expectedSpotifyArtistIds)],
    searchArtistName,
  };
}

async function processOneSong(
  admin: SupabaseClient,
  row: DomesticSpotifySongRow,
  dryRun: boolean,
  artistHintsCache: Map<string, Awaited<ReturnType<typeof resolveArtistSpotifyMatchHints>>>,
  ignoreCatalogFilter = false,
): Promise<DomesticSpotifyEnrichResult> {
  const base: DomesticSpotifyEnrichResult = {
    songId: row.id,
    displayTitle: row.display_title,
    mainArtist: row.main_artist,
    songTitle: row.song_title,
    status: 'error',
  };

  const skip = classifySkip(row, ignoreCatalogFilter);
  if (skip) {
    return { ...base, status: skip };
  }

  const existingId = row.spotify_track_id?.trim() ?? '';
  const mainArtist = row.main_artist?.trim() ?? '';
  const songTitle = row.song_title?.trim() ?? '';

  try {
    if (existingId) {
      const meta = await fetchSpotifyTrackById(existingId);
      const payload = buildEmptyFillPayload(row, {
        spotifyTrackId: existingId,
        spotifyPopularity: meta.spotifyPopularity,
        spotifyName: meta.spotifyName,
        spotifyArtists: meta.spotifyArtists,
        spotifyReleaseDate: meta.spotifyReleaseDate,
        spotifyImages: meta.spotifyImages,
      });
      if (Object.keys(payload).length === 0) {
        return { ...base, status: 'skipped_complete', spotifyTrackId: existingId };
      }
      if (dryRun) {
        return {
          ...base,
          status: 'would_update',
          reason: 'track_id_fill',
          spotifyTrackId: existingId,
          spotifyPopularity:
            typeof payload.spotify_popularity === 'number'
              ? payload.spotify_popularity
              : row.spotify_popularity ?? meta.spotifyPopularity,
        };
      }
      const { error } = await admin.from('songs').update(payload).eq('id', row.id);
      if (error) throw error;
      return {
        ...base,
        status: 'updated',
        reason: 'track_id_fill',
        spotifyTrackId: existingId,
        spotifyPopularity:
          typeof payload.spotify_popularity === 'number'
            ? payload.spotify_popularity
            : row.spotify_popularity ?? null,
      };
    }

    if (!mainArtist || !songTitle) {
      return { ...base, status: 'skipped_missing_meta' };
    }

    const cacheKey = mainArtist.split(',')[0]?.trim() || mainArtist;
    let hints = artistHintsCache.get(cacheKey);
    if (!hints) {
      hints = await resolveArtistSpotifyMatchHints(admin, mainArtist);
      artistHintsCache.set(cacheKey, hints);
    }

    const searchArtist = hints.searchArtistName || mainArtist;
    const searchQuery = `artist:${searchArtist.split(',')[0]?.trim() || searchArtist} track:${songTitle}`;
    const rawCandidates = await searchSpotifyTrackCandidatesByArtistTitle(
      searchArtist,
      songTitle,
      8,
    );
    if (rawCandidates.length === 0) {
      return { ...base, status: 'skipped_no_match', reason: 'no_candidates' };
    }

    const candidatesAll: SpotifyTrackCandidate[] = rawCandidates.map((t) => ({
      spotifyTrackId: t.spotifyTrackId!,
      spotifyName: t.spotifyName,
      spotifyArtists: t.spotifyArtists,
      artistRefs: t.artists,
      popularity: t.spotifyPopularity,
    }));

    // artists.spotify_artist_id があるときは、その ID の候補を優先（取りこぼし抑制）
    const expectedIds = new Set(hints.expectedSpotifyArtistIds);
    const candidates =
      expectedIds.size > 0
        ? (() => {
            const filtered = candidatesAll.filter((c) =>
              c.artistRefs.some((a) => expectedIds.has(a.id)),
            );
            return filtered.length > 0 ? filtered : candidatesAll;
          })()
        : candidatesAll;

    const matchOpts: SpotifyArtistMatchOptions = {
      alternateArtistNames: hints.alternateArtistNames,
      expectedSpotifyArtistIds: hints.expectedSpotifyArtistIds,
    };
    const { best, decision } = pickBestSpotifyCandidate(
      candidates,
      mainArtist,
      songTitle,
      matchOpts,
    );

    if (decision.action === 'review' && best) {
      const rank = candidates.findIndex((c) => c.spotifyTrackId === best.spotifyTrackId) + 1;
      if (dryRun) {
        return {
          ...base,
          status: 'would_review',
          reason: decision.reason,
          spotifyTrackId: best.spotifyTrackId,
          spotifyPopularity: best.popularity ?? null,
        };
      }
      await insertReviewQueue(admin, {
        songId: row.id,
        displayTitle: row.display_title,
        mainArtist,
        songTitle,
        spotifySearchQuery: searchQuery,
        candidate: best,
        candidateRank: rank > 0 ? rank : 1,
        reason: decision.reason,
      });
      return {
        ...base,
        status: 'queued_review',
        reason: decision.reason,
        spotifyTrackId: best.spotifyTrackId,
        spotifyPopularity: best.popularity ?? null,
      };
    }

    if (decision.action !== 'apply' || !best) {
      return {
        ...base,
        status: 'skipped_no_match',
        reason: decision.action === 'skip' ? decision.reason : 'no_match',
      };
    }

    const track: SpotifyTrackWithArtists | undefined = rawCandidates.find(
      (t) => t.spotifyTrackId === best.spotifyTrackId,
    );
    if (!track?.spotifyTrackId) {
      return { ...base, status: 'skipped_no_match', reason: 'candidate_missing' };
    }

    const payload = buildEmptyFillPayload(row, {
      spotifyTrackId: track.spotifyTrackId,
      spotifyPopularity: track.spotifyPopularity,
      spotifyName: track.spotifyName,
      spotifyArtists: track.spotifyArtists,
      spotifyReleaseDate: track.spotifyReleaseDate,
      spotifyImages: track.spotifyImages,
    });

    if (Object.keys(payload).length === 0) {
      return { ...base, status: 'skipped_complete', spotifyTrackId: track.spotifyTrackId };
    }

    if (dryRun) {
      return {
        ...base,
        status: 'would_update',
        reason: 'search_match',
        spotifyTrackId: track.spotifyTrackId,
        spotifyPopularity: track.spotifyPopularity,
      };
    }

    await ensureSpotifyArtistsInDb(admin, track.artists);
    const { error } = await admin.from('songs').update(payload).eq('id', row.id);
    if (error) throw error;
    clearArtistLookupIndexCache();
    await syncSongCreditsFromSongId(admin, row.id, true);

    return {
      ...base,
      status: 'updated',
      reason: 'search_match',
      spotifyTrackId: track.spotifyTrackId,
      spotifyPopularity: track.spotifyPopularity,
    };
  } catch (e) {
    return {
      ...base,
      status: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type RunDomesticSongsSpotifyEnrichOptions = {
  dryRun: boolean;
  songIds?: string[];
  artistName?: string;
  limit?: number;
  delayMs?: number;
  /** 曲詳細の明示取得など: domestic / western-treated フィルタを外す */
  ignoreCatalogFilter?: boolean;
};

export async function runDomesticSongsSpotifyEnrich(
  admin: SupabaseClient,
  options: RunDomesticSongsSpotifyEnrichOptions,
): Promise<{ summary: DomesticSpotifyEnrichSummary; results: DomesticSpotifyEnrichResult[] }> {
  const dryRun = options.dryRun !== false;
  const ignoreCatalogFilter = options.ignoreCatalogFilter === true;
  const limit = clampDomesticSpotifyEnrichLimit(options.limit);
  const delayMs =
    options.delayMs != null && Number.isFinite(options.delayMs)
      ? Math.max(0, Math.floor(options.delayMs))
      : DOMESTIC_SPOTIFY_ENRICH_DELAY_MS;

  await ensureWesternTreatedJpArtistCache(admin);

  const token = await getSpotifyAccessToken();
  const summary = emptySummary();
  const results: DomesticSpotifyEnrichResult[] = [];

  let loaded: DomesticSpotifySongRow[] = [];
  const songIds = Array.isArray(options.songIds)
    ? options.songIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id.trim()))
    : [];
  const artistName =
    typeof options.artistName === 'string' ? options.artistName.trim() : '';

  if (songIds.length > 0) {
    loaded = await fetchSongsByIds(admin, songIds);
    summary.requested = songIds.length;
  } else if (artistName) {
    // 多めに取り、フィルタ後に limit
    loaded = await fetchSongsByArtistName(admin, artistName, Math.min(500, limit * 10));
    summary.requested = loaded.length;
  } else {
    throw new Error('songIds または artistName が必要です。');
  }

  if (!token) {
    for (const row of loaded.slice(0, limit)) {
      const skip = classifySkip(row, ignoreCatalogFilter);
      const status = skip ?? 'skipped_no_token';
      const r: DomesticSpotifyEnrichResult = {
        songId: row.id,
        displayTitle: row.display_title,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        status,
        message: status === 'skipped_no_token' ? 'SPOTIFY_CLIENT_ID / SECRET 未設定' : undefined,
      };
      results.push(r);
      bumpSummary(summary, status);
    }
    summary.targets = results.filter((r) =>
      ['would_update', 'would_review', 'updated', 'queued_review', 'skipped_no_token', 'skipped_no_match', 'skipped_missing_meta', 'error'].includes(
        r.status,
      ),
    ).length;
    return { summary, results };
  }

  const targets = (
    ignoreCatalogFilter
      ? loaded.filter((row) => songNeedsSpotifyFields(row))
      : filterDomesticSpotifyEnrichTargets(loaded)
  ).slice(0, limit);
  summary.targets = targets.length;

  // songIds 指定時は対象外も結果に含める（スキップ理由の可視化）
  if (songIds.length > 0) {
    const targetIds = new Set(targets.map((t) => t.id));
    for (const row of loaded) {
      if (targetIds.has(row.id)) continue;
      const skip = classifySkip(row, ignoreCatalogFilter) ?? 'skipped_complete';
      const r: DomesticSpotifyEnrichResult = {
        songId: row.id,
        displayTitle: row.display_title,
        mainArtist: row.main_artist,
        songTitle: row.song_title,
        status: skip,
      };
      results.push(r);
      bumpSummary(summary, skip);
    }
  }

  const artistHintsCache = new Map<
    string,
    Awaited<ReturnType<typeof resolveArtistSpotifyMatchHints>>
  >();

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]!;
    const r = await processOneSong(admin, row, dryRun, artistHintsCache, ignoreCatalogFilter);
    results.push(r);
    bumpSummary(summary, r.status);
    if (i < targets.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return { summary, results };
}
