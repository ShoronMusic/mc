/**
 * 選曲後（非同期）：Spotify 検索 → 一致時のみ songs 更新 + song_credits。
 * 疑いがある場合は spotify 列は触らず song_spotify_review_queue へ。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchSpotifyArtistsByIds,
  searchSpotifyTrackCandidatesByArtistTitle,
  searchSpotifyTrackCandidatesByFreeText,
  SPOTIFY_MARKET_DOMESTIC,
} from '@/lib/spotify-search-track';
import {
  pickBestSpotifyCandidate,
  type SpotifyTrackCandidate,
} from '@/lib/spotify-track-match';
import { resolveSpotifyArtistMatchHints } from '@/lib/spotify-artist-match-hints';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
} from '@/lib/song-credits-sync';
import { resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
import { normalizeSongCatalogScope } from '@/lib/song-catalog-scope';

export function isSongSelectionSpotifyEnrichEnabled(): boolean {
  const v = process.env.SONG_SELECTION_SPOTIFY_ENRICH?.trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  if (v === '0' || lower === 'false') return false;
  return v === '1' || lower === 'true';
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
      console.warn('[song-selection-spotify-enrich] artist insert', error.message);
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
    console.warn('[song-selection-spotify-enrich] review queue table missing');
    return;
  }
  if (error) {
    console.warn('[song-selection-spotify-enrich] review insert', error.message);
  }
}

export async function enrichSongFromSpotifySelection(
  admin: SupabaseClient,
  songId: string,
): Promise<void> {
  const { data: song, error } = await admin
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, spotify_track_id, music8_song_data, music8_artist_slug, catalog_scope',
    )
    .eq('id', songId)
    .maybeSingle();
  if (error) throw error;
  if (!song) return;

  const existingTrackId = (song as { spotify_track_id?: string | null }).spotify_track_id?.trim();
  if (existingTrackId) return;

  const displayTitle = (song as { display_title?: string }).display_title?.trim() ?? '';
  const mainArtist = (song as { main_artist?: string }).main_artist?.trim() ?? '';
  const songTitle = (song as { song_title?: string }).song_title?.trim() ?? '';
  const songSlug = (song as { music8_artist_slug?: string | null }).music8_artist_slug?.trim() ?? null;
  const catalogScope = normalizeSongCatalogScope(
    (song as { catalog_scope?: string | null }).catalog_scope,
  );
  const market =
    catalogScope === 'domestic' ? SPOTIFY_MARKET_DOMESTIC : undefined;
  if (!mainArtist || !songTitle) return;

  const hints = await resolveSpotifyArtistMatchHints(admin, mainArtist, {
    songMusic8ArtistSlug: songSlug,
  });
  const searchNames =
    hints.searchArtistNames.length > 0
      ? hints.searchArtistNames
      : [hints.searchArtistName || mainArtist];

  const seenIds = new Set<string>();
  const rawCandidates: Awaited<ReturnType<typeof searchSpotifyTrackCandidatesByArtistTitle>> = [];
  const merge = (list: typeof rawCandidates) => {
    for (const t of list) {
      const id = t.spotifyTrackId?.trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      rawCandidates.push(t);
    }
  };
  for (const searchArtist of searchNames.slice(0, 2)) {
    merge(
      await searchSpotifyTrackCandidatesByArtistTitle(searchArtist, songTitle, 8, { market }),
    );
  }
  {
    const latin = searchNames.find((n) => /[A-Za-z]/.test(n));
    const freeQ = [latin || mainArtist.split(',')[0]?.trim() || mainArtist, songTitle]
      .filter(Boolean)
      .join(' ');
    merge(await searchSpotifyTrackCandidatesByFreeText(freeQ, 8, { market }));
  }
  if (rawCandidates.length === 0) return;

  const searchQuery = searchNames
    .slice(0, 2)
    .map((a) => `artist:${a.split(',')[0]?.trim() || a} track:${songTitle}`)
    .join(' | ');

  const candidates: SpotifyTrackCandidate[] = rawCandidates.map((t) => ({
    spotifyTrackId: t.spotifyTrackId!,
    spotifyName: t.spotifyName,
    spotifyArtists: t.spotifyArtists,
    artistRefs: t.artists,
    popularity: t.spotifyPopularity,
  }));

  const matchOpts = {
    alternateArtistNames: hints.alternateArtistNames,
    expectedSpotifyArtistIds: hints.expectedSpotifyArtistIds,
    crossScriptArtistNames: hints.crossScriptArtistNames,
  };

  const { best, decision } = pickBestSpotifyCandidate(
    candidates,
    mainArtist,
    songTitle,
    matchOpts,
  );

  if (decision.action === 'review' && best) {
    const rank = candidates.findIndex((c) => c.spotifyTrackId === best.spotifyTrackId) + 1;
    await insertReviewQueue(admin, {
      songId,
      displayTitle: displayTitle || null,
      mainArtist,
      songTitle,
      spotifySearchQuery: searchQuery,
      candidate: best,
      candidateRank: rank > 0 ? rank : 1,
      reason: decision.reason,
    });
    return;
  }

  if (decision.action !== 'apply' || !best) return;

  const track = rawCandidates.find((t) => t.spotifyTrackId === best.spotifyTrackId);
  if (!track) return;

  await ensureSpotifyArtistsInDb(admin, track.artists);

  const songUpdate: Record<string, unknown> = {
    spotify_track_id: track.spotifyTrackId,
    spotify_name: track.spotifyName ?? undefined,
    spotify_artists: track.spotifyArtists ?? undefined,
    spotify_release_date: track.spotifyReleaseDate ?? undefined,
    spotify_popularity:
      track.spotifyPopularity != null ? Math.round(track.spotifyPopularity) : undefined,
  };
  if (track.spotifyImages) songUpdate.spotify_images = track.spotifyImages;

  const { error: uErr } = await admin.from('songs').update(songUpdate).eq('id', songId);
  if (uErr) throw uErr;

  clearArtistLookupIndexCache();
  await syncSongCreditsFromSongId(admin, songId, true);
}

/** 選曲 upsert 後に非同期で呼ぶ（失敗はログのみ） */
export function scheduleSongSelectionSpotifyEnrich(songId: string | null): void {
  if (!songId?.trim() || !isSongSelectionSpotifyEnrichEnabled()) return;

  void (async () => {
    const admin = createAdminClient();
    if (!admin) return;
    try {
      await enrichSongFromSpotifySelection(admin, songId.trim());
    } catch (e) {
      console.warn(
        '[song-selection-spotify-enrich]',
        songId,
        e instanceof Error ? e.message : e,
      );
    }
  })();
}
