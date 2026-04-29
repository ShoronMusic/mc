import type { SupabaseClient } from '@supabase/supabase-js';

export type SongRowForArtistCount = {
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
};

const PAGE = 1000;

/**
 * アーティスト別曲数集計用に `songs` を全件読む。
 * 単発 select は PostgREST の既定上限（多くは 1000 行）で切られ、曲数と一覧件数が一致しなくなるためページングする。
 */
export async function fetchAllSongRowsForArtistAggregation(
  client: SupabaseClient,
): Promise<SongRowForArtistCount[]> {
  const out: SongRowForArtistCount[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('songs')
      .select('main_artist, song_title, display_title')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as SongRowForArtistCount[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}
