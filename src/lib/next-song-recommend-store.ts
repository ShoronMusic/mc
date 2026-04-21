import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextSongPick } from '@/lib/next-song-recommend-generate';

export const NEXT_SONG_RECOMMEND_MAX_STOCK = 9;

export interface NextSongRecommendRow {
  id: string;
  seed_song_id: string | null;
  seed_video_id: string;
  seed_label: string;
  recommended_artist: string;
  recommended_title: string;
  reason: string;
  youtube_search_query: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

export async function countActiveNextSongRecommendBySeedVideo(
  supabase: SupabaseClient | null,
  seedVideoId: string,
): Promise<number> {
  if (!supabase || !seedVideoId.trim()) return 0;
  const { count, error } = await supabase
    .from('next_song_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('seed_video_id', seedVideoId.trim())
    .eq('is_active', true);
  if (error) {
    if (error.code === '42P01') return 0;
    console.error('[next-song-recommend-store] count', error.message);
    return 0;
  }
  return typeof count === 'number' ? count : 0;
}

export async function getActiveNextSongRecommendBySeedVideo(
  supabase: SupabaseClient | null,
  seedVideoId: string,
  limit = 3,
): Promise<NextSongRecommendRow[]> {
  if (!supabase || !seedVideoId.trim()) return [];
  const capped = Math.max(1, Math.min(9, limit));
  const { data, error } = await supabase
    .from('next_song_recommendations')
    .select(
      'id, seed_song_id, seed_video_id, seed_label, recommended_artist, recommended_title, reason, youtube_search_query, order_index, is_active, created_at',
    )
    .eq('seed_video_id', seedVideoId.trim())
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(capped);
  if (error) {
    if (error.code === '42P01') return [];
    console.error('[next-song-recommend-store] select', error.message);
    return [];
  }
  return Array.isArray(data) ? (data as NextSongRecommendRow[]) : [];
}

export async function insertNextSongRecommendRows(
  supabase: SupabaseClient | null,
  params: {
    seedSongId?: string | null;
    seedVideoId: string;
    seedLabel: string;
    picks: NextSongPick[];
  },
): Promise<NextSongRecommendRow[]> {
  if (!supabase || !params.seedVideoId.trim() || params.picks.length === 0) return [];
  const rows = params.picks.map((p, idx) => ({
    seed_song_id: params.seedSongId ?? null,
    seed_video_id: params.seedVideoId.trim(),
    seed_label: params.seedLabel.trim().slice(0, 280),
    recommended_artist: p.artist.trim().slice(0, 120),
    recommended_title: p.title.trim().slice(0, 200),
    reason: p.reason.trim().slice(0, 400),
    youtube_search_query: p.youtubeSearchQuery.trim().slice(0, 200),
    order_index: idx + 1,
    is_active: true,
  }));
  const { data, error } = await supabase
    .from('next_song_recommendations')
    .insert(rows)
    .select(
      'id, seed_song_id, seed_video_id, seed_label, recommended_artist, recommended_title, reason, youtube_search_query, order_index, is_active, created_at',
    );
  if (error) {
    if (error.code === '42P01') return [];
    console.error('[next-song-recommend-store] insert', error.message);
    return [];
  }
  return Array.isArray(data) ? (data as NextSongRecommendRow[]) : [];
}

export async function softDeleteNextSongRecommendById(
  supabase: SupabaseClient | null,
  id: string,
): Promise<boolean> {
  if (!supabase || !id.trim()) return false;
  const { data, error } = await supabase
    .from('next_song_recommendations')
    .update({ is_active: false })
    .eq('id', id.trim())
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return false;
    console.error('[next-song-recommend-store] soft delete', error.message);
    return false;
  }
  return Boolean((data as { id?: string } | null)?.id);
}

