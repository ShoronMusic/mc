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
/** アーティスト／曲名の解決が変わったあとに誤本文を残さないため */
export async function deleteCommentaryByVideoId(
  supabase: SupabaseClient | null,
  videoId: string,
): Promise<void> {
  if (!supabase || !videoId.trim()) return;
  const { error } = await supabase.from('song_commentary').delete().eq('video_id', videoId.trim());
  if (error && error.code !== '42P01') {
    console.error('[commentary-library] delete', error);
  }
}

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
/**
 * DB に保存した曲解説は先頭が「アーティスト - 曲名\n\n」形式。
 * 返却時は最新の解決結果で先頭行だけ差し替え、古い誤順のプレフィックスを矯正する。
 */
export function reapplyCommentaryLibraryBodyPrefix(
  storedBody: string,
  artistDisplay: string | null,
  song: string | null,
  mainArtistFallback: string | null,
): string {
  const prefix =
    artistDisplay && song
      ? `${artistDisplay} - ${song}`
      : mainArtistFallback && song
        ? `${mainArtistFallback} - ${song}`
        : '';
  if (!prefix) return storedBody;
  const t = storedBody.trimStart();
  const sep = '\n\n';
  const idx = t.indexOf(sep);
  if (idx !== -1) {
    const head = t.slice(0, idx);
    if (/ - /.test(head)) {
      const rest = t.slice(idx + sep.length);
      return `${prefix}${sep}${rest}`;
    }
  }
  return `${prefix}${sep}${t}`;
}

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
