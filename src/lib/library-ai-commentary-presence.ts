import type { SupabaseClient } from '@supabase/supabase-js';

const ID_CHUNK = 80;

/**
 * 指定 video_id のうち、曲解説基本枠（song_tidbits.source = ai_commentary）が
 * 有効に存在するものを返す。
 */
export async function fetchVideoIdsWithAiCommentary(
  supabase: SupabaseClient,
  videoIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const uniq = [...new Set(videoIds.map((v) => v.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;

  for (let i = 0; i < uniq.length; i += ID_CHUNK) {
    const chunk = uniq.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from('song_tidbits')
      .select('video_id')
      .in('video_id', chunk)
      .eq('source', 'ai_commentary')
      .eq('is_active', true);

    if (error) {
      if (error.code !== '42P01') {
        console.warn('[library-ai-commentary-presence] video', error.message);
      }
      break;
    }

    for (const row of (data ?? []) as { video_id?: string | null }[]) {
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      if (vid) out.add(vid);
    }
  }

  return out;
}

/**
 * 曲単位: song_id 直下、または紐づくいずれかの video_id に ai_commentary があれば true。
 * 代表動画の取り違えでアイコンが消えるのを防ぐ。
 */
export async function fetchSongIdsWithAiCommentary(
  supabase: SupabaseClient,
  songIds: string[],
  videoIdsBySongId: Map<string, string[]>,
): Promise<Set<string>> {
  const out = new Set<string>();
  const uniqSongs = [...new Set(songIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqSongs.length === 0) return out;

  for (let i = 0; i < uniqSongs.length; i += ID_CHUNK) {
    const chunk = uniqSongs.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from('song_tidbits')
      .select('song_id')
      .in('song_id', chunk)
      .eq('source', 'ai_commentary')
      .eq('is_active', true);

    if (error) {
      if (error.code !== '42P01') {
        console.warn('[library-ai-commentary-presence] song', error.message);
      }
      break;
    }

    for (const row of (data ?? []) as { song_id?: string | null }[]) {
      const sid = typeof row.song_id === 'string' ? row.song_id.trim() : '';
      if (sid) out.add(sid);
    }
  }

  const pendingSongs = uniqSongs.filter((id) => !out.has(id));
  if (pendingSongs.length === 0) return out;

  const allVids: string[] = [];
  const songByVideo = new Map<string, string>();
  for (const sid of pendingSongs) {
    for (const vid of videoIdsBySongId.get(sid) ?? []) {
      const v = vid.trim();
      if (!v) continue;
      allVids.push(v);
      if (!songByVideo.has(v)) songByVideo.set(v, sid);
    }
  }

  const vidsWith = await fetchVideoIdsWithAiCommentary(supabase, allVids);
  for (const vid of vidsWith) {
    const sid = songByVideo.get(vid);
    if (sid) out.add(sid);
  }

  return out;
}
