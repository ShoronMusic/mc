/**
 * 曲の基本情報ライブラリの検索・登録（Supabase 利用）
 * video_id をキーに1曲1件で保存し、同じ曲のときは再利用する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SongCommentaryRow {
  id: string;
  body: string;
  video_id: string;
  artist_name: string | null;
  song_title: string | null;
  created_at: string;
}

/**
 * video_id でライブラリを検索。ヒットすればその1件を返す。
 */
export async function getCommentaryByVideoId(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongCommentaryRow | null> {
  if (!supabase || !videoId.trim()) return null;

  const { data, error } = await supabase
    .from('song_commentary')
    .select('id, body, video_id, artist_name, song_title, created_at')
    .eq('video_id', videoId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    console.error('[commentary-library] get', error);
    return null;
  }
  return data as SongCommentaryRow | null;
}

export interface InsertCommentaryParams {
  body: string;
  videoId: string;
  artistName?: string | null;
  songTitle?: string | null;
}

/**
 * 曲の基本情報を1件登録。同じ video_id が既にあれば登録せず既存を返す。
 */
export async function insertCommentaryToLibrary(
  supabase: SupabaseClient | null,
  params: InsertCommentaryParams
): Promise<SongCommentaryRow | null> {
  if (!supabase) return null;

  const { body, videoId, artistName, songTitle } = params;
  const trimmed = body.trim();
  if (!trimmed || !videoId.trim()) return null;

  const existing = await getCommentaryByVideoId(supabase, videoId.trim());
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from('song_commentary')
    .insert({
      body: trimmed,
      video_id: videoId.trim(),
      artist_name: artistName ?? null,
      song_title: songTitle ?? null,
    })
    .select('id, body, video_id, artist_name, song_title, created_at')
    .single();

  if (error) {
    if (error.code === '42P01') return null;
    if (error.code === '23505') {
      const row = await getCommentaryByVideoId(supabase, videoId.trim());
      return row;
    }
    console.error('[commentary-library] insert failed', error.code, error.message, error.details);
    return null;
  }
  return inserted as SongCommentaryRow;
}
