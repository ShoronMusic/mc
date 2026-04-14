import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongEra } from '@/lib/gemini';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

export interface SongEraResolveInput {
  songTitle: string;
  artistName?: string | null;
  oembedTitle?: string | null;
  description?: string | null;
  /** YouTube Data API の `publishedAt`（MV 公開年。Gemma が年代ラベルを外したときのフォールバックに使用） */
  publishedAtIso?: string | null;
}

function normalizeEra(era: string | null | undefined): SongEraOption | null {
  if (typeof era !== 'string') return null;
  const trimmed = era.trim();
  return SONG_ERA_OPTIONS.includes(trimmed as SongEraOption) ? (trimmed as SongEraOption) : null;
}

/** YouTube 動画の公開年から十年ラベル（録音年ではなく MV/公式動画の公開に基づく目安） */
export function songEraFromYoutubePublishedAt(iso: string | null | undefined): SongEraOption | null {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  if (y < 1950) return 'Pre-50s';
  if (y < 1960) return '50s';
  if (y < 1970) return '60s';
  if (y < 1980) return '70s';
  if (y < 1990) return '80s';
  if (y < 2000) return '90s';
  if (y < 2010) return '00s';
  if (y < 2020) return '10s';
  return '20s';
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
  const fromPublished = songEraFromYoutubePublishedAt(input.publishedAtIso);
  const cached = await getEraFromDb(supabase, videoId);
  if (cached && cached !== 'Other') return cached;
  if (cached === 'Other' && fromPublished && fromPublished !== 'Other') {
    if (supabase) await setEraInDb(supabase, videoId, fromPublished);
    return fromPublished;
  }

  const title = input.songTitle?.trim() || input.oembedTitle?.trim() || videoId.trim() || 'Unknown';
  let eraLabel = await getSongEra(
    title,
    input.artistName ?? undefined,
    input.description ?? undefined,
    usageMeta
  );
  let normalized = normalizeEra(eraLabel) ?? 'Other';
  if (normalized === 'Other' && fromPublished && fromPublished !== 'Other') {
    normalized = fromPublished;
  }
  if (supabase) await setEraInDb(supabase, videoId, normalized);
  return normalized;
}

