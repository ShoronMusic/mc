/**
 * 曲詳細: 手動 Spotify track ID から曲メタ・人気度・アーティストを上書き取得。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackWithArtistsById,
  getSpotifyAccessToken,
  parseSpotifyTrackIdInput,
  SPOTIFY_MARKET_DOMESTIC,
  type SpotifyTrackMeta,
  type SpotifyTrackArtistRef,
} from '@/lib/spotify-search-track';
import { planSongDisplayFromSpotifyArtists } from '@/lib/song-display-from-spotify-artists';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
} from '@/lib/song-credits-sync';
import { resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
import { normalizeSongCatalogScope } from '@/lib/song-catalog-scope';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 曲行の Spotify メタ。リセット対象（表示名・クレジットは含めない）。 */
export const SPOTIFY_SONG_RESET_FIELDS = [
  'spotify_track_id',
  'spotify_name',
  'spotify_artists',
  'spotify_release_date',
  'spotify_popularity',
  'spotify_images',
] as const;

export function buildClearSpotifySongPayload(): Record<(typeof SPOTIFY_SONG_RESET_FIELDS)[number], null> {
  return {
    spotify_track_id: null,
    spotify_name: null,
    spotify_artists: null,
    spotify_release_date: null,
    spotify_popularity: null,
    spotify_images: null,
  };
}

/** Music8 スナップショット内の track ID を外す（再取得で誤 ID が戻らないように）。 */
export function stripSpotifyTrackIdFromMusic8SongData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  let changed = false;
  if ('spotify_track_id' in obj) {
    delete obj.spotify_track_id;
    changed = true;
  }
  const ids = obj.identifiers;
  if (ids && typeof ids === 'object' && !Array.isArray(ids) && 'spotify_track_id' in (ids as object)) {
    const nextIds = { ...(ids as Record<string, unknown>) };
    delete nextIds.spotify_track_id;
    obj.identifiers = nextIds;
    changed = true;
  }
  return changed ? obj : raw;
}

export function songHasResettableSpotifyMeta(row: {
  spotify_track_id?: string | null;
  spotify_name?: string | null;
  spotify_artists?: string | null;
  spotify_release_date?: string | null;
  spotify_popularity?: number | null;
  spotify_images?: string | null;
}): boolean {
  if ((row.spotify_track_id ?? '').trim()) return true;
  if ((row.spotify_name ?? '').trim()) return true;
  if ((row.spotify_artists ?? '').trim()) return true;
  if ((row.spotify_release_date ?? '').trim()) return true;
  if ((row.spotify_images ?? '').trim()) return true;
  if (row.spotify_popularity != null && Number.isFinite(row.spotify_popularity)) return true;
  return false;
}

export function buildOverwriteSpotifySongPayload(opts: {
  songTitle: string | null | undefined;
  currentMainArtist: string | null | undefined;
  currentDisplayTitle: string | null | undefined;
  meta: SpotifyTrackMeta;
  trackArtistNames?: string[] | null;
}): Record<string, unknown> | null {
  const trackId = (opts.meta.spotifyTrackId ?? '').trim();
  if (!trackId) return null;

  const payload: Record<string, unknown> = { spotify_track_id: trackId };
  if (opts.meta.spotifyPopularity != null && Number.isFinite(opts.meta.spotifyPopularity)) {
    payload.spotify_popularity = Math.max(0, Math.min(100, Math.round(opts.meta.spotifyPopularity)));
  }
  if (opts.meta.spotifyName?.trim()) payload.spotify_name = opts.meta.spotifyName.trim();
  if (opts.meta.spotifyArtists?.trim()) payload.spotify_artists = opts.meta.spotifyArtists.trim();
  if (opts.meta.spotifyReleaseDate?.trim()) {
    payload.spotify_release_date = opts.meta.spotifyReleaseDate.trim();
  }
  if (opts.meta.spotifyImages?.trim()) payload.spotify_images = opts.meta.spotifyImages.trim();

  const displayPlan = planSongDisplayFromSpotifyArtists({
    songTitle: opts.songTitle,
    spotifyArtists: opts.meta.spotifyArtists,
    trackArtistNames: opts.trackArtistNames,
    currentMainArtist: opts.currentMainArtist,
    currentDisplayTitle: opts.currentDisplayTitle,
  });
  if (displayPlan) {
    payload.main_artist = displayPlan.mainArtist;
    payload.display_title = displayPlan.displayTitle;
  }
  return payload;
}

export async function upsertSpotifyArtistsFromTrack(
  admin: SupabaseClient,
  artistRefs: SpotifyTrackArtistRef[],
): Promise<{ created: number; patched: number }> {
  if (artistRefs.length === 0) return { created: 0, patched: 0 };
  const details = await fetchSpotifyArtistsByIds(artistRefs.map((a) => a.id));
  const detailById = new Map(details.map((d) => [d.id, d]));
  const index = await loadArtistLookupIndex(admin);
  let created = 0;
  let patched = 0;

  for (const ref of artistRefs) {
    const detail = detailById.get(ref.id) ?? {
      id: ref.id,
      name: ref.name,
      popularity: null,
      images: null,
    };
    const existingId = resolveArtistIdFromIndex(index, detail.name, null);
    if (existingId) {
      const { data, error } = await admin
        .from('artists')
        .select('spotify_artist_id, spotify_artist_images, spotify_artist_popularity')
        .eq('id', existingId)
        .maybeSingle();
      if (error && error.code !== '42703' && error.code !== '42P01') {
        console.warn('[admin-song-spotify-by-track-id] artist select', error.message);
        continue;
      }
      const curId = ((data as { spotify_artist_id?: string | null } | null)?.spotify_artist_id ?? '').trim();
      const patch: Record<string, unknown> = {};
      if (!curId) patch.spotify_artist_id = detail.id;
      const curImages = ((data as { spotify_artist_images?: string | null } | null)?.spotify_artist_images ?? '')
        .trim();
      if (!curImages && detail.images) patch.spotify_artist_images = detail.images;
      const curPop = (data as { spotify_artist_popularity?: number | null } | null)?.spotify_artist_popularity;
      if (
        (curPop == null || !Number.isFinite(Number(curPop))) &&
        detail.popularity != null &&
        Number.isFinite(detail.popularity)
      ) {
        patch.spotify_artist_popularity = detail.popularity;
      }
      if (Object.keys(patch).length === 0) continue;
      const { error: uErr } = await admin.from('artists').update(patch).eq('id', existingId);
      if (uErr && uErr.code !== '42703' && uErr.code !== '42P01') {
        console.warn('[admin-song-spotify-by-track-id] artist patch', uErr.message);
        continue;
      }
      if (!uErr) patched += 1;
      continue;
    }

    const insertPayload: Record<string, unknown> = {
      name: detail.name,
      spotify_artist_id: detail.id,
    };
    if (detail.images) insertPayload.spotify_artist_images = detail.images;
    if (detail.popularity != null) insertPayload.spotify_artist_popularity = detail.popularity;
    const { error } = await admin.from('artists').insert(insertPayload);
    if (error?.code === '23505') {
      const { data: bySp } = await admin
        .from('artists')
        .select('id')
        .eq('spotify_artist_id', detail.id)
        .maybeSingle();
      const existingSp = (bySp as { id?: string } | null)?.id?.trim();
      if (existingSp) {
        patched += 1;
        continue;
      }
      continue;
    }
    if (error && error.code !== '42703' && error.code !== '42P01') {
      console.warn('[admin-song-spotify-by-track-id] artist insert', error.message);
      continue;
    }
    if (!error) created += 1;
  }

  clearArtistLookupIndexCache();
  return { created, patched };
}

export type ApplyManualSpotifyTrackIdResult =
  | {
      ok: true;
      spotifyTrackId: string;
      spotifyPopularity: number | null;
      spotifyArtists: string | null;
      mainArtist: string | null;
      displayTitle: string | null;
      artistsCreated: number;
      artistsPatched: number;
    }
  | { ok: false; error: string; status?: number };

export async function applyManualSpotifyTrackIdToSong(
  admin: SupabaseClient,
  songIdRaw: string,
  trackInput: string,
): Promise<ApplyManualSpotifyTrackIdResult> {
  const songId = songIdRaw.trim();
  if (!songId || !UUID_RE.test(songId)) {
    return { ok: false, error: 'songId が無効です。', status: 400 };
  }
  const trackId = parseSpotifyTrackIdInput(trackInput);
  if (!trackId) {
    return {
      ok: false,
      error: 'Spotify の track ID または曲 URL（open.spotify.com/track/…）を入力してください。',
      status: 400,
    };
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    return { ok: false, error: 'SPOTIFY_CLIENT_ID / SECRET が未設定か無効です。', status: 503 };
  }

  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('id, song_title, main_artist, display_title, catalog_scope')
    .eq('id', songId)
    .maybeSingle();
  if (songErr) return { ok: false, error: songErr.message, status: 500 };
  if (!song) return { ok: false, error: '曲が見つかりません。', status: 404 };

  const market =
    normalizeSongCatalogScope((song as { catalog_scope?: string | null }).catalog_scope) === 'domestic'
      ? SPOTIFY_MARKET_DOMESTIC
      : undefined;
  const track = await fetchSpotifyTrackWithArtistsById(trackId, { market });
  if (!track.spotifyTrackId) {
    return { ok: false, error: 'その track ID の曲が Spotify に見つかりませんでした。', status: 404 };
  }

  const payload = buildOverwriteSpotifySongPayload({
    songTitle: (song as { song_title?: string | null }).song_title,
    currentMainArtist: (song as { main_artist?: string | null }).main_artist,
    currentDisplayTitle: (song as { display_title?: string | null }).display_title,
    meta: track,
    trackArtistNames: track.artists.map((a) => a.name),
  });
  if (!payload) {
    return { ok: false, error: 'Spotify メタを組み立てられませんでした。', status: 502 };
  }

  const { error: upErr } = await admin.from('songs').update(payload).eq('id', songId);
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  const artistStats = await upsertSpotifyArtistsFromTrack(admin, track.artists);
  await syncSongCreditsFromSongId(admin, songId, true);

  return {
    ok: true,
    spotifyTrackId: track.spotifyTrackId,
    spotifyPopularity: track.spotifyPopularity,
    spotifyArtists: track.spotifyArtists,
    mainArtist:
      typeof payload.main_artist === 'string'
        ? payload.main_artist
        : ((song as { main_artist?: string | null }).main_artist ?? null),
    displayTitle:
      typeof payload.display_title === 'string'
        ? payload.display_title
        : ((song as { display_title?: string | null }).display_title ?? null),
    artistsCreated: artistStats.created,
    artistsPatched: artistStats.patched,
  };
}

export type ClearSpotifyMetaFromSongResult =
  | { ok: true; clearedFields: string[]; reviewQueueDeleted: boolean }
  | { ok: false; error: string; status?: number };

export async function clearSpotifyMetaFromSong(
  admin: SupabaseClient,
  songIdRaw: string,
): Promise<ClearSpotifyMetaFromSongResult> {
  const songId = songIdRaw.trim();
  if (!songId || !UUID_RE.test(songId)) {
    return { ok: false, error: 'songId が無効です。', status: 400 };
  }

  const { data: song, error: songErr } = await admin
    .from('songs')
    .select('id, music8_song_data')
    .eq('id', songId)
    .maybeSingle();
  if (songErr) return { ok: false, error: songErr.message, status: 500 };
  if (!song) return { ok: false, error: '曲が見つかりません。', status: 404 };

  const payload: Record<string, unknown> = { ...buildClearSpotifySongPayload() };
  const snapshot = (song as { music8_song_data?: unknown }).music8_song_data;
  const stripped = stripSpotifyTrackIdFromMusic8SongData(snapshot);
  if (stripped !== snapshot) payload.music8_song_data = stripped;

  const { error: upErr } = await admin.from('songs').update(payload).eq('id', songId);
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  let reviewQueueDeleted = false;
  const { error: qErr } = await admin.from('song_spotify_review_queue').delete().eq('song_id', songId);
  if (!qErr) reviewQueueDeleted = true;
  else if (qErr.code !== '42P01') {
    console.warn('[admin-song-spotify-by-track-id] review queue delete', qErr.message);
  }

  const { error: vErr } = await admin.from('song_videos').update({ spotify_track_id: null }).eq('song_id', songId);
  if (vErr && vErr.code !== '42703' && vErr.code !== '42P01') {
    console.warn('[admin-song-spotify-by-track-id] song_videos spotify_track_id clear', vErr.message);
  }

  return {
    ok: true,
    clearedFields: [...SPOTIFY_SONG_RESET_FIELDS],
    reviewQueueDeleted,
  };
}
