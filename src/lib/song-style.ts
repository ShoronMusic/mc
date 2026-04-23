/**
 * 曲スタイルの取得・キャッシュ（Supabase song_style 利用）
 * Music8 でスタイルが取れたときはそれを保存し、AI は Music8 未取得時のみ。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongStyle, type SongStyle } from '@/lib/gemini';
import { trySongStyleFromMusic8 } from '@/lib/music8-style-to-app';

function isSongStyleTableMissingError(error: { code?: string } | null | undefined): boolean {
  const code = (error?.code ?? '').trim();
  // 42P01: relation does not exist, PGRST205: schema cache miss (table not exposed)
  return code === '42P01' || code === 'PGRST205';
}

async function getStyleFromRoomPlaybackHistory(
  supabase: SupabaseClient,
  videoId: string,
): Promise<SongStyle | null> {
  const { data, error } = await supabase
    .from('room_playback_history')
    .select('style, played_at')
    .eq('video_id', videoId.trim())
    .not('style', 'is', null)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[song-style] fallback get(room_playback_history)', error);
    return null;
  }
  const style = data?.style;
  return typeof style === 'string' && style.trim() ? (style.trim() as SongStyle) : null;
}

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
    if (isSongStyleTableMissingError(error)) {
      return getStyleFromRoomPlaybackHistory(supabase, videoId);
    }
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
    if (isSongStyleTableMissingError(error)) {
      // song_style テーブルが無い環境でも、履歴行に反映して次回以降の推定に使えるようにする。
      const { error: upHistErr } = await supabase
        .from('room_playback_history')
        .update({ style })
        .eq('video_id', videoId.trim());
      if (upHistErr) {
        console.error('[song-style] set fallback(room_playback_history) failed', upHistErr.code, upHistErr.message);
        return false;
      }
      return true;
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
  fullVideoTitleForMusic8?: string | null,
  usageMeta?: { roomId?: string | null; videoId?: string | null }
): Promise<SongStyle> {
  const music8Result = await trySongStyleFromMusic8(
    artistName,
    fullVideoTitleForMusic8 ?? title
  );
  if (music8Result.style) {
    if (supabase) await setStyleInDb(supabase, videoId, music8Result.style);
    return music8Result.style;
  }

  const cached = supabase ? await getStyleFromDb(supabase, videoId) : null;
  if (cached) return cached;

  const style = await getSongStyle(title, artistName ?? undefined, usageMeta);
  if (supabase) await setStyleInDb(supabase, videoId, style);
  return style;
}
