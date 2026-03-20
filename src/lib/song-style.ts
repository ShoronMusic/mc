/**
 * 曲スタイルの取得・キャッシュ（Supabase song_style 利用）
 * 一度判定した曲は DB に保存し、同じ video_id では AI を再呼び出ししない。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongStyle, type SongStyle } from '@/lib/gemini';

export async function getStyleFromDb(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongStyle | null> {
  if (!supabase || !videoId.trim()) return null;

  const { data, error } = await supabase
    .from('song_style')
    .select('style')
    .eq('video_id', videoId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    console.error('[song-style] get', error);
    return null;
  }
  const style = data?.style;
  return typeof style === 'string' && style.trim() ? (style.trim() as SongStyle) : null;
}

export async function setStyleInDb(
  supabase: SupabaseClient | null,
  videoId: string,
  style: SongStyle
): Promise<boolean> {
  if (!supabase || !videoId.trim()) return false;

  const { error } = await supabase.from('song_style').upsert(
    { video_id: videoId.trim(), style },
    { onConflict: 'video_id' }
  );
  if (error) {
    if (error.code === '42P01') {
      console.error('[song-style] setStyleInDb: song_style テーブルがありません。docs/supabase-song-style-table.md の SQL を実行してください。');
    } else {
      console.error('[song-style] setStyleInDb failed', error.code, error.message);
    }
    return false;
  }
  return true;
}

/**
 * キャッシュにあれば返す。なければ AI で判定して保存してから返す。
 */
export async function getOrAssignStyle(
  supabase: SupabaseClient | null,
  videoId: string,
  title: string,
  artistName?: string | null
): Promise<SongStyle> {
  const cached = supabase ? await getStyleFromDb(supabase, videoId) : null;
  if (cached) return cached;

  const style = await getSongStyle(title, artistName ?? undefined);
  if (supabase) await setStyleInDb(supabase, videoId, style);
  return style;
}
