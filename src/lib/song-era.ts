import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongEra } from '@/lib/gemini';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

export interface SongEraResolveInput {
  songTitle: string;
  artistName?: string | null;
  oembedTitle?: string | null;
  description?: string | null;
}

function normalizeEra(era: string | null | undefined): SongEraOption | null {
  if (typeof era !== 'string') return null;
  const trimmed = era.trim();
  return SONG_ERA_OPTIONS.includes(trimmed as SongEraOption) ? (trimmed as SongEraOption) : null;
}

export async function getEraFromDb(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongEraOption | null> {
  if (!supabase || !videoId.trim()) return null;

  const { data, error } = await supabase
    .from('song_era')
    .select('era')
    .eq('video_id', videoId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    console.error('[song-era] get', error);
    return null;
  }
  return normalizeEra(data?.era);
}

export async function setEraInDb(
  supabase: SupabaseClient | null,
  videoId: string,
  era: SongEraOption
): Promise<boolean> {
  if (!supabase || !videoId.trim()) return false;

  const { error } = await supabase.from('song_era').upsert(
    { video_id: videoId.trim(), era },
    { onConflict: 'video_id' }
  );
  if (error) {
    if (error.code === '42P01') {
      console.error('[song-era] setEraInDb: song_era テーブルがありません。');
    } else {
      console.error('[song-era] setEraInDb failed', error.code, error.message);
    }
    return false;
  }
  return true;
}

export async function getOrAssignEra(
  supabase: SupabaseClient | null,
  videoId: string,
  input: SongEraResolveInput,
  usageMeta?: { roomId?: string | null; videoId?: string | null }
): Promise<SongEraOption> {
  const cached = await getEraFromDb(supabase, videoId);
  if (cached) return cached;

  const title = input.songTitle?.trim() || input.oembedTitle?.trim() || videoId.trim() || 'Unknown';
  const era = await getSongEra(
    title,
    input.artistName ?? undefined,
    input.description ?? undefined,
    usageMeta
  );
  const normalized = normalizeEra(era) ?? 'Other';
  if (supabase) await setEraInDb(supabase, videoId, normalized);
  return normalized;
}

