/**
 * 曲スタイルの取得・キャッシュ（Supabase song_style / songs.style 利用）
 * DB に確定スタイルがあるときはそれを優先。無いときだけ Music8、さらに無いとき Gemini。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSongStyle, type SongStyle } from '@/lib/gemini';
import { trySongStyleFromMusic8 } from '@/lib/music8-style-to-app';
import { parseUsableSongStyle, shouldCacheAssignedSongStyle } from '@/lib/song-styles';
import { createAdminClient } from '@/lib/supabase/admin';

function isSongStyleTableMissingError(error: { code?: string } | null | undefined): boolean {
  const code = (error?.code ?? '').trim();
  // 42P01: relation does not exist, PGRST205: schema cache miss (table not exposed)
  return code === '42P01' || code === 'PGRST205';
}

/** video_id キャッシュの読み書きは service_role を優先（anon だと RLS 42501 になる環境がある） */
function songStyleDbClient(passed: SupabaseClient | null): SupabaseClient | null {
  return createAdminClient() ?? passed;
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
  return parseUsableSongStyle(typeof style === 'string' ? style : null) as SongStyle | null;
}

async function getStyleFromSongsMaster(
  supabase: SupabaseClient | null,
  videoId: string,
  songId?: string | null,
): Promise<SongStyle | null> {
  const db = songStyleDbClient(supabase);
  if (!db) return null;

  let id = (songId ?? '').trim();
  if (!id && videoId.trim()) {
    const { data: link, error: linkErr } = await db
      .from('song_videos')
      .select('song_id')
      .eq('video_id', videoId.trim())
      .limit(1)
      .maybeSingle();
    if (linkErr && linkErr.code !== '42P01' && linkErr.code !== 'PGRST205') {
      console.error('[song-style] songs lookup via song_videos', linkErr);
    }
    id = typeof link?.song_id === 'string' ? link.song_id.trim() : '';
  }
  if (!id) return null;

  const { data, error } = await db.from('songs').select('style').eq('id', id).maybeSingle();
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205' && error.code !== '42703') {
      console.error('[song-style] get(songs.style)', error);
    }
    return null;
  }
  return parseUsableSongStyle(typeof data?.style === 'string' ? data.style : null) as SongStyle | null;
}

export async function getStyleFromDb(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongStyle | null> {
  const db = songStyleDbClient(supabase);
  if (!db || !videoId.trim()) return null;

  const { data, error } = await db
    .from('song_style')
    .select('style')
    .eq('video_id', videoId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isSongStyleTableMissingError(error)) {
      return getStyleFromRoomPlaybackHistory(db, videoId);
    }
    console.error('[song-style] get', error);
    return null;
  }
  const style = data?.style;
  return parseUsableSongStyle(typeof style === 'string' ? style : null) as SongStyle | null;
}

export async function setStyleInDb(
  supabase: SupabaseClient | null,
  videoId: string,
  style: SongStyle
): Promise<boolean> {
  const db = songStyleDbClient(supabase);
  if (!db || !videoId.trim()) return false;

  const { error } = await db.from('song_style').upsert(
    { video_id: videoId.trim(), style },
    { onConflict: 'video_id' }
  );
  if (error) {
    if (isSongStyleTableMissingError(error)) {
      // song_style テーブルが無い環境でも、履歴行に反映して次回以降の推定に使えるようにする。
      const { error: upHistErr } = await db
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
 * 1. 曲マスタ `songs.style`（管理画面で入れた値）
 * 2. song_style キャッシュ（過去の判定。Other は未確定として無視）
 * 3. Music8 の曲データ（style / genre がアプリの SongStyle に正規化できるとき）
 * 4. Gemini（毎回ブレうるため最後）
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
  usageMeta?: { roomId?: string | null; videoId?: string | null; songId?: string | null }
): Promise<SongStyle> {
  const fromSong = await getStyleFromSongsMaster(supabase, videoId, usageMeta?.songId);
  if (fromSong) {
    if (shouldCacheAssignedSongStyle(fromSong)) {
      await setStyleInDb(supabase, videoId, fromSong);
    }
    return fromSong;
  }

  const cached = await getStyleFromDb(supabase, videoId);
  if (cached && shouldCacheAssignedSongStyle(cached)) return cached;

  const music8Result = await trySongStyleFromMusic8(
    artistName,
    fullVideoTitleForMusic8 ?? title
  );
  if (music8Result.style) {
    if (shouldCacheAssignedSongStyle(music8Result.style)) {
      await setStyleInDb(supabase, videoId, music8Result.style);
    }
    return music8Result.style;
  }

  const style = await getSongStyle(title, artistName ?? undefined, usageMeta);
  if (shouldCacheAssignedSongStyle(style)) await setStyleInDb(supabase, videoId, style);
  return style;
}
