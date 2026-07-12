import type { SupabaseClient } from '@supabase/supabase-js';

export type SongRowForArtistCount = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  catalog_scope?: string | null;
  music8_artist_slug?: string | null;
};

export type SongCreditRowForArtistCount = {
  song_id: string;
  artist_name: string;
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
      .select('id, main_artist, song_title, display_title, catalog_scope, music8_artist_slug')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as SongRowForArtistCount[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/**
 * アーティスト索引用: `song_credits` 全行（feat. 等のサブクレジット参加曲を含める）。
 */
export async function fetchAllSongCreditRowsForArtistAggregation(
  client: SupabaseClient,
): Promise<SongCreditRowForArtistCount[]> {
  const out: SongCreditRowForArtistCount[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('song_credits')
      .select('song_id, artists(name), songs(main_artist, song_title, display_title)')
      .order('song_id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    const batch = data ?? [];
    for (const row of batch as {
      song_id?: string;
      artists?: { name?: string } | { name?: string }[] | null;
      songs?:
        | { main_artist?: string | null; song_title?: string | null; display_title?: string | null }
        | { main_artist?: string | null; song_title?: string | null; display_title?: string | null }[]
        | null;
    }[]) {
      const songId = row.song_id;
      if (!songId) continue;
      const artistObj = Array.isArray(row.artists) ? row.artists[0] : row.artists;
      const artistName = (artistObj?.name ?? '').trim();
      if (!artistName) continue;
      const songObj = Array.isArray(row.songs) ? row.songs[0] : row.songs;
      out.push({
        song_id: songId,
        artist_name: artistName,
        main_artist: songObj?.main_artist ?? null,
        song_title: songObj?.song_title ?? null,
        display_title: songObj?.display_title ?? null,
      });
    }
    if (batch.length < PAGE) break;
  }
  return out;
}
