import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const PAGE = 500;

export type SpotifyReviewQueueItem = {
  id: string;
  song_id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  spotify_search_query: string | null;
  candidate_rank: number | null;
  spotify_track_id: string | null;
  spotify_name: string | null;
  spotify_artists: string | null;
  reason: string;
  created_at: string;
  admin_song_href: string | null;
};

export type SpotifyReviewQueueDay = {
  date: string;
  items: SpotifyReviewQueueItem[];
};

function jstDateKeyFromIso(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  } catch {
    return iso.slice(0, 10);
  }
}

function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, n));
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get('days'));

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString();

  const rows: SpotifyReviewQueueItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('song_spotify_review_queue')
      .select(
        'id, song_id, display_title, main_artist, song_title, spotify_search_query, candidate_rank, spotify_track_id, spotify_name, spotify_artists, reason, created_at',
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          error: 'song_spotify_review_queue テーブルがありません。docs/supabase-songs-and-performances-tables.md の SQL を実行してください。',
          days: [],
        }, { status: 503 });
      }
      console.error('[admin/spotify-review-queue]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    for (const r of data) {
      const songId = (r as { song_id: string }).song_id;
      rows.push({
        id: (r as { id: string }).id,
        song_id: songId,
        display_title: (r as { display_title?: string }).display_title ?? null,
        main_artist: (r as { main_artist?: string }).main_artist ?? null,
        song_title: (r as { song_title?: string }).song_title ?? null,
        spotify_search_query: (r as { spotify_search_query?: string }).spotify_search_query ?? null,
        candidate_rank: (r as { candidate_rank?: number }).candidate_rank ?? null,
        spotify_track_id: (r as { spotify_track_id?: string }).spotify_track_id ?? null,
        spotify_name: (r as { spotify_name?: string }).spotify_name ?? null,
        spotify_artists: (r as { spotify_artists?: string }).spotify_artists ?? null,
        reason: (r as { reason: string }).reason,
        created_at: (r as { created_at: string }).created_at,
        admin_song_href: songId ? `/admin/songs/${songId}` : null,
      });
    }
    if (data.length < PAGE) break;
  }

  const byDay = new Map<string, SpotifyReviewQueueItem[]>();
  for (const item of rows) {
    const key = jstDateKeyFromIso(item.created_at);
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }

  const dayGroups: SpotifyReviewQueueDay[] = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));

  return NextResponse.json({
    days: dayGroups,
    total_items: rows.length,
    since_iso: sinceIso,
  });
}
