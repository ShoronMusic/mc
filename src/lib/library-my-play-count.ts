import type { SupabaseClient } from '@supabase/supabase-js';

const VIDEO_ID_CHUNK = 30;
const ROW_LIMIT_PER_CHUNK = 1500;

/**
 * ログインユーザーの room_playback_history から、指定 video_id の再生回数を集計。
 * 全履歴を range で走査せず、video_id 単位の in クエリに限定する（statement timeout 回避）。
 */
export async function fetchMyPlayCountByVideoIds(
  admin: SupabaseClient,
  userId: string,
  videoIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(videoIds.map((v) => v.trim()).filter(Boolean))];
  if (!userId || uniq.length === 0) return out;

  for (let i = 0; i < uniq.length; i += VIDEO_ID_CHUNK) {
    const chunk = uniq.slice(i, i + VIDEO_ID_CHUNK);
    const { data, error } = await admin
      .from('room_playback_history')
      .select('video_id')
      .eq('user_id', userId)
      .in('video_id', chunk)
      .limit(ROW_LIMIT_PER_CHUNK);

    if (error) {
      if (error.code !== '42P01') {
        console.warn('[library-my-play-count]', error.message);
      }
      break;
    }

    for (const row of (data ?? []) as { video_id?: string }[]) {
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      if (!vid) continue;
      out.set(vid, (out.get(vid) ?? 0) + 1);
    }
  }

  return out;
}
