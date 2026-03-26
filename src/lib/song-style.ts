/**
 * 曲スタイルの取得・キャッシュ（Supabase song_style 利用）
 * Music8 でスタイルが取れたときはそれを保存し、AI は Music8 未取得時のみ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongStyle, type SongStyle } from '@/lib/gemini';
import { trySongStyleFromMusic8 } from '@/lib/music8-style-to-app';

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
 * スタイル決定の優先順位:
 * 1. Music8 の曲データ（style / genre がアプリの SongStyle に正規化できるとき）
 * 2. song_style キャッシュ（過去の AI 判定など）
 * 3. Gemini（毎回ブレうるため最後）
 *
 * @param title AI 判定用の曲名（短いほうがよい）
 * @param fullVideoTitleForMusic8 YouTube 動画タイトル全文（Music8 検索用。省略時は title を使う）
 */
export async function getOrAssignStyle(
  supabase: SupabaseClient | null,
  videoId: string,
  title: string,
  artistName?: string | null,
  fullVideoTitleForMusic8?: string | null
): Promise<SongStyle> {
  const music8Style = await trySongStyleFromMusic8(
    artistName,
    fullVideoTitleForMusic8 ?? title
  );
  if (music8Style) {
    if (supabase) await setStyleInDb(supabase, videoId, music8Style);
    return music8Style;
  }

  const cached = supabase ? await getStyleFromDb(supabase, videoId) : null;
  if (cached) return cached;

  const style = await getSongStyle(title, artistName ?? undefined);
  if (supabase) await setStyleInDb(supabase, videoId, style);
  return style;
}
