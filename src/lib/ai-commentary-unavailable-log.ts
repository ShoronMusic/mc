/**
 * AI 曲解説が参照データ不足で「曲紹介のみ」になった選曲を管理用 DB に記録する。
 * 挿入はサービスロールクライアントのみ想定（RLS で anon/auth からは不可）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AiCommentaryUnavailableSource = 'comment_pack' | 'commentary';

export function buildYoutubeWatchUrl(videoId: string): string {
  const v = (videoId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(v)) return '';
  return `https://www.youtube.com/watch?v=${v}`;
}

/**
 * 非同期・失敗時は warn のみ（曲解説レスポンスは落とさない）。
 */
export async function insertAiCommentaryUnavailableEntry(
  admin: SupabaseClient,
  params: {
    userId: string | null;
    roomId: string | null;
    videoId: string;
    artistLabel: string;
    songLabel: string;
    source: AiCommentaryUnavailableSource;
  },
): Promise<void> {
  const watchUrl = buildYoutubeWatchUrl(params.videoId);
  if (!watchUrl) return;
  const artist = (params.artistLabel ?? '').trim().slice(0, 500) || '（不明）';
  const song = (params.songLabel ?? '').trim().slice(0, 500) || '（不明）';
  const room =
    typeof params.roomId === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(params.roomId.trim())
      ? params.roomId.trim()
      : null;
  const { error } = await admin.from('ai_commentary_unavailable_entries').insert({
    user_id: params.userId,
    room_id: room,
    video_id: params.videoId.trim(),
    watch_url: watchUrl.slice(0, 2000),
    artist_label: artist,
    song_label: song,
    source: params.source,
  });
  if (error) {
    if (error.code === '42P01') {
      console.warn('[ai-commentary-unavailable] table missing:', error.message);
      return;
    }
    console.warn('[ai-commentary-unavailable] insert failed:', error.message);
  }
}
