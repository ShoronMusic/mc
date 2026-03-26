/**
 * 曲の年代（十年）の取得・キャッシュ（Supabase song_era 利用）
 * - Music8 の releaseDate を最優先。無い・年が取れないときだけ AI。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';
import { fetchMusic8SongDataForPlaybackRow } from '@/lib/music8-song-lookup';
import { getSongEra } from '@/lib/gemini';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

export type SongEra = SongEraOption;
const DEBUG_MUSIC8 = process.env.DEBUG_MUSIC8 === '1' || process.env.DEBUG_MUSIC8 === 'true';

export { SONG_ERA_OPTIONS };

/** Music8 の release 表記（YYYY.MM 等）から西暦年を取る */
export function parseYearFromMusic8ReleaseDate(releaseDate: string): number | null {
  const s = (releaseDate ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) && y >= 1000 && y <= 2100 ? y : null;
}

export function yearToSongEra(year: number): SongEra {
  if (!Number.isFinite(year)) return 'Other';
  if (year < 1950) return 'Pre-50s';
  if (year < 1960) return '50s';
  if (year < 1970) return '60s';
  if (year < 1980) return '70s';
  if (year < 1990) return '80s';
  if (year < 2000) return '90s';
  if (year < 2010) return '00s';
  if (year < 2020) return '10s';
  if (year < 2030) return '20s';
  return '20s';
}

export async function getEraFromDb(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongEra | null> {
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
  const era = data?.era;
  if (typeof era !== 'string' || !era.trim()) return null;
  const t = era.trim() as SongEra;
  return SONG_ERA_OPTIONS.includes(t) ? t : null;
}

export async function setEraInDb(
  supabase: SupabaseClient | null,
  videoId: string,
  era: SongEra
): Promise<boolean> {
  if (!supabase || !videoId.trim()) return false;

  const { error } = await supabase.from('song_era').upsert(
    { video_id: videoId.trim(), era },
    { onConflict: 'video_id' }
  );
  if (error) {
    if (error.code === '42P01') {
      console.error('[song-era] setEraInDb: song_era テーブルがありません。docs/supabase-song-era-table.md を参照してください。');
    } else {
      console.error('[song-era] setEraInDb failed', error.code, error.message);
    }
    return false;
  }
  return true;
}

export interface GetOrAssignEraInput {
  songTitle: string;
  artistName: string | null;
  oembedTitle: string | null;
  description: string | null;
}

/**
 * キャッシュにあれば返す。なければ Music8 の releaseDate を優先し、無ければ AI。
 */
export async function getOrAssignEra(
  supabase: SupabaseClient | null,
  videoId: string,
  input: GetOrAssignEraInput
): Promise<SongEra> {
  const cached = supabase ? await getEraFromDb(supabase, videoId) : null;
  if (cached) {
    if (DEBUG_MUSIC8) console.info('[song-era] cache hit', { videoId, era: cached });
    return cached;
  }

  try {
    const main = (input.artistName ?? '').trim();
    const ytTitle = (input.oembedTitle ?? '').trim() || `${main} - ${(input.songTitle ?? '').trim()}`;
    if (main || ytTitle) {
      if (DEBUG_MUSIC8) {
        console.info('[song-era] Music8 lookup start', {
          videoId,
          main,
          ytTitle,
        });
      }
      const music8 = await fetchMusic8SongDataForPlaybackRow(main, ytTitle);
      if (music8) {
        const fields = extractMusic8SongFields(music8);
        const y = parseYearFromMusic8ReleaseDate(fields.releaseDate);
        if (y != null) {
          const era = yearToSongEra(y);
          if (DEBUG_MUSIC8) {
            console.info('[song-era] Music8 hit', {
              videoId,
              releaseDate: fields.releaseDate,
              year: y,
              era,
            });
          }
          if (supabase) await setEraInDb(supabase, videoId, era);
          return era;
        }
        if (DEBUG_MUSIC8) {
          console.warn('[song-era] Music8 matched but releaseDate unusable', {
            videoId,
            releaseDate: fields.releaseDate ?? null,
          });
        }
      } else if (DEBUG_MUSIC8) {
        console.warn('[song-era] Music8 miss', { videoId, main, ytTitle });
      }
    }
  } catch (e) {
    console.error('[song-era] Music8 era lookup', e);
  }

  if (DEBUG_MUSIC8) {
    console.warn('[song-era] AI fallback', {
      videoId,
      songTitle: input.songTitle,
      artistName: input.artistName ?? null,
    });
  }
  const era = await getSongEra(input.songTitle, input.artistName ?? undefined, input.description ?? undefined);
  if (supabase) await setEraInDb(supabase, videoId, era);
  if (DEBUG_MUSIC8) console.info('[song-era] AI selected', { videoId, era });
  return era;
}
