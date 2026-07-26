/**
 * 選曲 video_id → ライブラリ（songs / song_videos）の表示表記。
 * 手動整備済みマスタをチャット・視聴履歴の正とする。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaybackDisplayOverrideRow } from '@/lib/video-playback-display-override';
import { looksLikeProseOrBloatedDisplayTitle } from '@/lib/format-song-display';

export type LibrarySongDisplay = {
  songId: string;
  displayTitle: string;
  mainArtist: string | null;
  songTitle: string | null;
  /** `songs.original_release_date`（YYYY-MM-DD 等）。無ければ null */
  originalReleaseDate: string | null;
};

/** アナウンス／履歴用の「Artist - Song」行 */
export function buildLibrarySongAnnounceTitle(row: LibrarySongDisplay): string {
  const a = (row.mainArtist ?? '').trim();
  const s = (row.songTitle ?? '').trim();
  const dt = row.displayTitle.trim();
  /** 概要文が display_title に残っているときは main_artist / song_title を優先 */
  if (dt && !looksLikeProseOrBloatedDisplayTitle(dt)) return dt;
  if (a && s) return `${a} - ${s}`;
  if (dt) return dt;
  return a || s || '';
}

/** displayOverride と同形（管理者上書きが無いときのフォールバック用） */
export function librarySongToPlaybackDisplayOverride(
  row: LibrarySongDisplay,
): PlaybackDisplayOverrideRow | null {
  const title = buildLibrarySongAnnounceTitle(row);
  if (!title) return null;
  const artist = (row.mainArtist ?? '').trim();
  return {
    title,
    artist_name: artist || null,
  };
}

/**
 * `song_videos.video_id` → `songs` の表示用行。
 * 未登録・テーブル無しは null。
 */
export async function fetchLibrarySongDisplayByVideoId(
  client: SupabaseClient | null | undefined,
  videoId: string,
): Promise<LibrarySongDisplay | null> {
  if (!client) return null;
  const vid = videoId.trim();
  if (!vid) return null;

  const { data: link, error: linkErr } = await client
    .from('song_videos')
    .select('song_id')
    .eq('video_id', vid)
    .maybeSingle();

  if (linkErr) {
    if (linkErr.code === '42P01') return null;
    console.error('[library-song-display-by-video] song_videos', linkErr.code, linkErr.message);
    return null;
  }

  const songId = typeof (link as { song_id?: unknown } | null)?.song_id === 'string'
    ? ((link as { song_id: string }).song_id).trim()
    : '';
  if (!songId) return null;

  const { data: song, error: songErr } = await client
    .from('songs')
    .select('id, display_title, main_artist, song_title, original_release_date')
    .eq('id', songId)
    .maybeSingle();

  if (songErr) {
    if (songErr.code === '42P01') return null;
    console.error('[library-song-display-by-video] songs', songErr.code, songErr.message);
    return null;
  }

  const row = song as {
    id?: string;
    display_title?: string | null;
    main_artist?: string | null;
    song_title?: string | null;
    original_release_date?: string | null;
  } | null;
  if (!row?.id) return null;

  const displayTitle = typeof row.display_title === 'string' ? row.display_title.trim() : '';
  const mainArtist =
    typeof row.main_artist === 'string' && row.main_artist.trim() ? row.main_artist.trim() : null;
  const songTitle =
    typeof row.song_title === 'string' && row.song_title.trim() ? row.song_title.trim() : null;
  const originalReleaseDate =
    typeof row.original_release_date === 'string' && row.original_release_date.trim()
      ? row.original_release_date.trim()
      : null;

  if (!displayTitle && !mainArtist && !songTitle) return null;

  return {
    songId: row.id,
    displayTitle,
    mainArtist,
    songTitle,
    originalReleaseDate,
  };
}

/**
 * 管理者上書き → ライブラリ → ヒント の優先で表示行を決める。
 */
export function preferPlaybackDisplaySources(params: {
  adminOverride: PlaybackDisplayOverrideRow | null;
  library: LibrarySongDisplay | null;
  hint?: PlaybackDisplayOverrideRow | null;
}): PlaybackDisplayOverrideRow | null {
  if (params.adminOverride) return params.adminOverride;
  const fromLib = params.library ? librarySongToPlaybackDisplayOverride(params.library) : null;
  if (fromLib) return fromLib;
  return params.hint ?? null;
}
