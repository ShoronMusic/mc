/**
 * Spotify のアーティスト並びを正として songs.main_artist / display_title を揃える。
 *（YouTube 抽出のメインのみ表記より、spotify_artists の順序を優先）
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import { fetchSpotifyTrackWithArtistsById } from '@/lib/spotify-search-track';

function dedupeNamesPreserveOrder(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type SongDisplayFromSpotifyPlan = {
  mainArtist: string;
  displayTitle: string;
};

/**
 * track API の artists[] 名があれば最優先。なければ spotify_artists 文字列をパース。
 */
export function planSongDisplayFromSpotifyArtists(opts: {
  songTitle: string | null | undefined;
  spotifyArtists?: string | null;
  trackArtistNames?: string[] | null;
  currentMainArtist?: string | null;
  currentDisplayTitle?: string | null;
}): SongDisplayFromSpotifyPlan | null {
  const songTitle = (opts.songTitle ?? '').trim();
  if (!songTitle) return null;

  const fromTrack = Array.isArray(opts.trackArtistNames)
    ? dedupeNamesPreserveOrder(opts.trackArtistNames)
    : [];
  const names =
    fromTrack.length > 0 ? fromTrack : parseSpotifyArtistsString(opts.spotifyArtists ?? '');
  if (names.length === 0) return null;

  const mainArtist = names.join(', ');
  const displayTitle = buildSongDisplayTitle(mainArtist, songTitle);
  if (!displayTitle) return null;

  const curMain = (opts.currentMainArtist ?? '').trim();
  const curDisp = (opts.currentDisplayTitle ?? '').trim();
  if (curMain === mainArtist && curDisp === displayTitle) return null;

  return { mainArtist, displayTitle };
}

export type ApplySongDisplayFromSpotifyResult = {
  updated: boolean;
  mainArtist?: string;
  displayTitle?: string;
  skippedReason?: string;
};

/**
 * spotify_track_id があれば API の並び、なければ songs.spotify_artists で main_artist / display_title を更新。
 */
export async function applySongDisplayFromSpotifyArtists(
  admin: SupabaseClient,
  songId: string,
): Promise<ApplySongDisplayFromSpotifyResult> {
  const id = songId.trim();
  if (!id) return { updated: false, skippedReason: 'empty_song_id' };

  const { data: row, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, spotify_artists, spotify_track_id')
    .eq('id', id)
    .maybeSingle();
  if (error?.code === '42P01' || error?.code === '42703') {
    return { updated: false, skippedReason: 'schema' };
  }
  if (error) throw error;
  if (!row) return { updated: false, skippedReason: 'not_found' };

  const trackId = ((row as { spotify_track_id?: string | null }).spotify_track_id ?? '').trim();
  let trackArtistNames: string[] | null = null;
  if (trackId) {
    try {
      const track = await fetchSpotifyTrackWithArtistsById(trackId);
      if (track.artists.length > 0) {
        trackArtistNames = track.artists.map((a) => a.name);
      }
    } catch (e) {
      console.warn(
        '[song-display-from-spotify] fetch track',
        id,
        e instanceof Error ? e.message : e,
      );
    }
  }

  const plan = planSongDisplayFromSpotifyArtists({
    songTitle: (row as { song_title?: string | null }).song_title,
    spotifyArtists: (row as { spotify_artists?: string | null }).spotify_artists,
    trackArtistNames,
    currentMainArtist: (row as { main_artist?: string | null }).main_artist,
    currentDisplayTitle: (row as { display_title?: string | null }).display_title,
  });
  if (!plan) return { updated: false, skippedReason: 'no_change_or_no_spotify' };

  const fullPayload = {
    main_artist: plan.mainArtist,
    display_title: plan.displayTitle,
  };
  let { error: uErr } = await admin.from('songs').update(fullPayload).eq('id', id);
  if (uErr?.code === '23505') {
    // display_title 一意衝突時は main_artist のみ
    const r = await admin.from('songs').update({ main_artist: plan.mainArtist }).eq('id', id);
    uErr = r.error;
    if (!uErr) {
      return {
        updated: true,
        mainArtist: plan.mainArtist,
        skippedReason: 'display_title_conflict',
      };
    }
  }
  if (uErr?.code === '42703' || uErr?.code === '42P01') {
    return { updated: false, skippedReason: 'schema' };
  }
  if (uErr) throw uErr;

  return {
    updated: true,
    mainArtist: plan.mainArtist,
    displayTitle: plan.displayTitle,
  };
}
