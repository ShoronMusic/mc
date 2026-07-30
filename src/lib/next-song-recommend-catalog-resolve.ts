/**
 * 「次に聴くなら」提案曲が mc DB または Music8（GCS）に存在するかを解決し、YouTube URL を返す。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeLikeForIlike } from '@/lib/library-search-query';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';
import { fetchMusic8SongData } from '@/lib/music8-song-lookup';
import { normalizeNextSongPickMatchKey } from '@/lib/next-song-recommend-store';

export type NextSongPickCatalogHit = {
  inMcDb: boolean;
  inMusic8: boolean;
  songId: string | null;
  videoId: string | null;
  watchUrl: string | null;
  /** mc `songs` の登録表記（ライブラリマッチ行の表示用） */
  dbMainArtist: string | null;
  dbSongTitle: string | null;
  dbDisplayTitle: string | null;
};

function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function extractYoutubeVideoIdFromMusic8Json(
  json: Record<string, unknown> | null | undefined,
): string | null {
  if (!json || typeof json !== 'object') return null;
  const yt = json.youtube;
  if (!yt || typeof yt !== 'object' || Array.isArray(yt)) return null;
  const o = yt as Record<string, unknown>;
  const primary = typeof o.primary_id === 'string' ? o.primary_id.trim() : '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(primary)) return primary;
  if (Array.isArray(o.ids)) {
    for (const id of o.ids) {
      if (typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id.trim())) return id.trim();
    }
  }
  const legacy = typeof json.videoId === 'string' ? json.videoId.trim() : '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(legacy)) return legacy;
  return null;
}

async function lookupMcDbSongVideo(
  supabase: SupabaseClient,
  artist: string,
  title: string,
): Promise<{
  songId: string;
  videoId: string | null;
  mainArtist: string;
  songTitle: string;
  displayTitle: string | null;
} | null> {
  const artistTrim = artist.trim();
  const titleTrim = title.trim();
  if (!artistTrim || !titleTrim) return null;

  const targetKey = normalizeNextSongPickMatchKey(artistTrim, titleTrim);
  const escapedA = escapeLikeForIlike(artistTrim);
  const escapedT = escapeLikeForIlike(titleTrim);

  const { data: rows, error } = await supabase
    .from('songs')
    .select('id, main_artist, song_title, display_title')
    .ilike('main_artist', escapedA)
    .ilike('song_title', escapedT)
    .limit(8);

  if (error?.code === '42P01' || error?.code === '42703') return null;
  if (error) {
    console.warn('[next-song-recommend-catalog] songs lookup', error.message);
    return null;
  }

  let matchedRow: {
    id: string;
    main_artist: string;
    song_title: string;
    display_title: string | null;
  } | null = null;

  for (const row of rows ?? []) {
    const ma = (row as { main_artist?: string | null }).main_artist?.trim() ?? '';
    const st = (row as { song_title?: string | null }).song_title?.trim() ?? '';
    if (!ma || !st) continue;
    if (normalizeNextSongPickMatchKey(ma, st) !== targetKey) continue;
    matchedRow = {
      id: (row as { id: string }).id,
      main_artist: ma,
      song_title: st,
      display_title: (row as { display_title?: string | null }).display_title?.trim() ?? null,
    };
    break;
  }

  if (!matchedRow) {
    const displayGuess = `${artistTrim} - ${titleTrim}`;
    const { data: byDisplay, error: dErr } = await supabase
      .from('songs')
      .select('id, main_artist, song_title, display_title')
      .ilike('display_title', escapeLikeForIlike(displayGuess))
      .limit(5);
    if (!dErr && Array.isArray(byDisplay)) {
      for (const row of byDisplay) {
        const dt = (row as { display_title?: string | null }).display_title?.trim() ?? '';
        if (dt.toLowerCase() !== displayGuess.toLowerCase()) continue;
        const ma = (row as { main_artist?: string | null }).main_artist?.trim() ?? '';
        const st = (row as { song_title?: string | null }).song_title?.trim() ?? '';
        if (!ma || !st) continue;
        matchedRow = {
          id: (row as { id: string }).id,
          main_artist: ma,
          song_title: st,
          display_title: dt || null,
        };
        break;
      }
    }
  }

  if (!matchedRow) return null;
  const songId = matchedRow.id;

  const { data: videos, error: vErr } = await supabase
    .from('song_videos')
    .select('video_id')
    .eq('song_id', songId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (vErr) {
    if (vErr.code !== '42P01') {
      console.warn('[next-song-recommend-catalog] song_videos', vErr.message);
    }
  }

  const videoId = (videos?.[0] as { video_id?: string } | undefined)?.video_id?.trim() ?? '';
  return {
    songId,
    videoId: /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null,
    mainArtist: matchedRow.main_artist,
    songTitle: matchedRow.song_title,
    displayTitle: matchedRow.display_title,
  };
}

async function lookupMusic8Song(
  artist: string,
  title: string,
): Promise<{ found: boolean; videoId: string | null }> {
  const json = await fetchMusic8SongData(artist, title, {
    fetchJson: fetchJsonWithOptionalGcsAuth,
  });
  return {
    found: Boolean(json),
    videoId: extractYoutubeVideoIdFromMusic8Json(json),
  };
}

export async function resolveNextSongPickCatalogHit(
  supabase: SupabaseClient | null,
  artist: string,
  title: string,
): Promise<NextSongPickCatalogHit> {
  const empty: NextSongPickCatalogHit = {
    inMcDb: false,
    inMusic8: false,
    songId: null,
    videoId: null,
    watchUrl: null,
    dbMainArtist: null,
    dbSongTitle: null,
    dbDisplayTitle: null,
  };

  const artistTrim = artist.trim();
  const titleTrim = title.trim();
  if (!artistTrim || !titleTrim) return empty;

  let mc: Awaited<ReturnType<typeof lookupMcDbSongVideo>> = null;
  let music8: Awaited<ReturnType<typeof lookupMusic8Song>> = {
    found: false,
    videoId: null,
  };

  if (supabase) {
    try {
      mc = await lookupMcDbSongVideo(supabase, artistTrim, titleTrim);
    } catch (e) {
      console.warn('[next-song-recommend-catalog] mc lookup', e);
    }
  }

  try {
    music8 = await lookupMusic8Song(artistTrim, titleTrim);
  } catch (e) {
    console.warn('[next-song-recommend-catalog] music8 lookup', e);
  }

  const videoId = mc?.videoId ?? music8.videoId ?? null;
  if (!videoId) {
    return {
      inMcDb: Boolean(mc),
      inMusic8: music8.found,
      songId: mc?.songId ?? null,
      videoId: null,
      watchUrl: null,
      dbMainArtist: mc?.mainArtist ?? null,
      dbSongTitle: mc?.songTitle ?? null,
      dbDisplayTitle: mc?.displayTitle ?? null,
    };
  }

  return {
    inMcDb: Boolean(mc),
    inMusic8: music8.found,
    songId: mc?.songId ?? null,
    videoId,
    watchUrl: buildWatchUrl(videoId),
    dbMainArtist: mc?.mainArtist ?? null,
    dbSongTitle: mc?.songTitle ?? null,
    dbDisplayTitle: mc?.displayTitle ?? null,
  };
}

export async function enrichNextSongPicksWithCatalog<
  T extends { artist: string; title: string },
>(
  supabase: SupabaseClient | null,
  picks: T[],
): Promise<(T & { catalog: NextSongPickCatalogHit })[]> {
  return Promise.all(
    picks.map(async (pick) => ({
      ...pick,
      catalog: await resolveNextSongPickCatalogHit(supabase, pick.artist, pick.title),
    })),
  );
}
