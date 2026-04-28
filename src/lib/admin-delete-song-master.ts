/**
 * STYLE_ADMIN 用：曲マスタ `songs` 1 行と、紐づくライブラリ系行を削除（Service Role 想定）。
 * room_playback_history は残す（ログ用途）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function deleteSongMasterCascade(
  admin: SupabaseClient,
  songId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sid = songId.trim();
  if (!sid) return { ok: false, message: 'songId が空です。' };

  const { data: vidRows, error: vErr } = await admin.from('song_videos').select('video_id').eq('song_id', sid);
  if (vErr && vErr.code !== '42P01') {
    return { ok: false, message: vErr.message };
  }
  const videoIds = (vidRows ?? [])
    .map((r: { video_id?: string | null }) => r.video_id)
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  if (videoIds.length > 0) {
    const { error: cErr } = await admin.from('song_commentary').delete().in('video_id', videoIds);
    if (cErr && cErr.code !== '42P01') {
      console.warn('[admin-delete-song-master] song_commentary', cErr.code, cErr.message);
    }
  }

  const { error: f1 } = await admin.from('comment_feedback').delete().eq('song_id', sid);
  if (f1 && f1.code !== '42P01') {
    console.warn('[admin-delete-song-master] comment_feedback song_id', f1.code, f1.message);
  }
  if (videoIds.length > 0) {
    const { error: f2 } = await admin.from('comment_feedback').delete().in('video_id', videoIds);
    if (f2 && f2.code !== '42P01') {
      console.warn('[admin-delete-song-master] comment_feedback video_id', f2.code, f2.message);
    }
  }

  const { error: tErr } = await admin.from('song_tidbits').delete().eq('song_id', sid);
  if (tErr && tErr.code !== '42P01') {
    console.warn('[admin-delete-song-master] song_tidbits', tErr.code, tErr.message);
  }

  const { error: nErr } = await admin.from('next_song_recommendations').update({ seed_song_id: null }).eq('seed_song_id', sid);
  if (nErr && nErr.code !== '42P01' && nErr.code !== '42703') {
    console.warn('[admin-delete-song-master] next_song_recommendations', nErr.code, nErr.message);
  }

  const { data: deleted, error: dErr } = await admin.from('songs').delete().eq('id', sid).select('id');
  if (dErr) {
    return { ok: false, message: dErr.message };
  }
  if (!Array.isArray(deleted) || deleted.length === 0) {
    return { ok: false, message: '対象の曲マスタが見つかりませんでした。' };
  }
  return { ok: true };
}
