/**
 * song_credits テーブルへの同期（選曲登録・バックフィル共用）
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildArtistLookupIndex,
  resolveSongCreditsFromInput,
  type ArtistLookupIndex,
  type ArtistLookupRow,
  type SongCreditInput,
} from '@/lib/song-credits-resolve';
import { fetchSpotifyTrackWithArtistsById } from '@/lib/spotify-search-track';

export type SyncSongCreditsResult = {
  songId: string;
  applied: boolean;
  creditCount: number;
  unresolved: string[];
  source: string | null;
  primaryArtistId: string | null;
  skippedReason?: string;
};

let cachedIndex: ArtistLookupIndex | null = null;

export async function loadArtistLookupIndex(
  admin: SupabaseClient,
): Promise<ArtistLookupIndex> {
  if (cachedIndex) return cachedIndex;

  console.error('[song-credits-sync] loading artist lookup index (paginated)…');
  const rows: ArtistLookupRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select('id, name, music8_artist_slug')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const id = (r as { id?: string }).id?.trim() ?? '';
      const name = (r as { name?: string }).name?.trim() ?? '';
      if (!id || !name) continue;
      rows.push({
        id,
        name,
        music8_artist_slug: (r as { music8_artist_slug?: string | null }).music8_artist_slug ?? null,
      });
    }
    if (data.length < PAGE) break;
  }
  cachedIndex = buildArtistLookupIndex(rows);
  return cachedIndex;
}

export function clearArtistLookupIndexCache(): void {
  cachedIndex = null;
}

export async function songCreditsTableAvailable(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from('song_credits').select('song_id').limit(1);
  if (error?.code === '42P01' || error?.code === 'PGRST205') return false;
  if (error?.code === '42703') return false;
  if (error) throw error;
  return true;
}

export type SongCreditDbRow = {
  song_id: string;
  artist_id: string;
  role: string;
  display_order: number;
  is_display_main: boolean;
  source: string;
};

export function planSongCreditDbRows(
  songId: string,
  input: SongCreditInput,
  index: ArtistLookupIndex,
): {
  rows: SongCreditDbRow[];
  creditCount: number;
  unresolved: string[];
  source: string | null;
  primaryArtistId: string | null;
} {
  const { credits, unresolved, source } = resolveSongCreditsFromInput(input, index);
  if (credits.length === 0) {
    return { rows: [], creditCount: 0, unresolved, source, primaryArtistId: null };
  }
  const seenArtist = new Set<string>();
  const deduped = credits.filter((c) => {
    if (seenArtist.has(c.artistId)) return false;
    seenArtist.add(c.artistId);
    return true;
  });
  const rows = deduped.map((c, i) => ({
    song_id: songId,
    artist_id: c.artistId,
    role: c.role,
    display_order: i,
    is_display_main: i === 0,
    source: c.source,
  }));
  return {
    rows,
    creditCount: deduped.length,
    unresolved,
    source,
    primaryArtistId: deduped[0]?.artistId ?? null,
  };
}

export async function syncSongCreditsForSong(
  admin: SupabaseClient,
  songId: string,
  input: SongCreditInput,
  index: ArtistLookupIndex,
  apply: boolean,
): Promise<SyncSongCreditsResult> {
  const base: SyncSongCreditsResult = {
    songId,
    applied: false,
    creditCount: 0,
    unresolved: [],
    source: null,
    primaryArtistId: null,
  };

  const planned = planSongCreditDbRows(songId, input, index);
  base.unresolved = planned.unresolved;
  base.source = planned.source;
  base.creditCount = planned.creditCount;
  base.primaryArtistId = planned.primaryArtistId;

  if (planned.creditCount === 0) {
    base.skippedReason = planned.unresolved.length > 0 ? 'all_unresolved' : 'no_credit_names';
    return base;
  }

  if (!apply) return base;

  const { error: delErr } = await admin.from('song_credits').delete().eq('song_id', songId);
  if (delErr?.code === '42P01' || delErr?.code === '42703') {
    base.skippedReason = 'song_credits_table_missing';
    return base;
  }
  if (delErr) throw delErr;

  const { error: insErr } = await admin.from('song_credits').insert(planned.rows);
  if (insErr) throw insErr;

  if (base.primaryArtistId) {
    const { error: linkErr } = await admin
      .from('songs')
      .update({ artist_id: base.primaryArtistId })
      .eq('id', songId);
    if (linkErr && linkErr.code !== '42703' && linkErr.code !== '42P01') {
      console.warn('[song-credits-sync] update songs.artist_id', linkErr.message);
    }
  }

  base.applied = true;
  return base;
}

export async function syncSongCreditsFromSongId(
  admin: SupabaseClient,
  songId: string,
  apply = true,
  index?: ArtistLookupIndex,
): Promise<SyncSongCreditsResult | null> {
  const ok = await songCreditsTableAvailable(admin);
  if (!ok) return null;

  const { data: row, error } = await admin
    .from('songs')
    .select('id, display_title, spotify_artists, main_artist, music8_song_data, spotify_track_id')
    .eq('id', songId)
    .maybeSingle();
  if (error?.code === '42P01' || error?.code === '42703') return null;
  if (error) throw error;
  if (!row) return null;

  const trackId = (row as { spotify_track_id?: string | null }).spotify_track_id?.trim() ?? '';
  let trackArtistNames: string[] | null = null;
  if (trackId) {
    const track = await fetchSpotifyTrackWithArtistsById(trackId);
    if (track.artists.length > 0) {
      trackArtistNames = track.artists.map((a) => a.name);
    }
  }

  const idx = index ?? (await loadArtistLookupIndex(admin));
  const input: SongCreditInput = {
    display_title: (row as { display_title?: string | null }).display_title ?? null,
    spotify_artists: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
    main_artist: (row as { main_artist?: string | null }).main_artist ?? null,
    music8_song_data:
      (row as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
    trackArtistNames,
  };

  return syncSongCreditsForSong(admin, songId, input, idx, apply);
}
