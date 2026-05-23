import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  chunkArray,
  jstDateKeyFromPlayedAt,
  songRowHasPersistedMusic8,
} from '@/lib/admin-music8-pending';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const MAX_ROWS = 5000;

export type SongsNewlyRegisteredItem = {
  song_id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number;
  created_at: string;
  has_music8: boolean;
  video_ids: string[];
  admin_song_href: string;
};

export type SongsNewlyRegisteredDay = {
  date: string;
  items: SongsNewlyRegisteredItem[];
};

type SongRow = {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number | null;
  created_at: string;
  music8_song_data?: unknown;
};

function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, n));
}

function parseIsoOrNull(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function loadVideoIdsBySongId(
  supabase: NonNullable<Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>>,
  songIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (songIds.length === 0) return out;

  for (const chunk of chunkArray(songIds, 120)) {
    const { data, error } = await supabase
      .from('song_videos')
      .select('song_id, video_id')
      .in('song_id', chunk);

    if (error) {
      if (error.code === '42P01') return out;
      console.error('[admin/songs-newly-registered] song_videos', error);
      continue;
    }

    for (const row of (data ?? []) as { song_id?: string; video_id?: string }[]) {
      const sid = typeof row.song_id === 'string' ? row.song_id.trim() : '';
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      if (!sid || !vid) continue;
      const list = out.get(sid) ?? [];
      if (!list.includes(vid)) list.push(vid);
      out.set(sid, list);
    }
  }

  return out;
}

/**
 * GET: `songs.created_at` ベースで新規登録曲を JST 日付別に返す。
 * Query: days=1..90（既定 14）, from=ISO, to=ISO（省略時は to=現在・from=to-days）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get('days'));
  const toIso = parseIsoOrNull(searchParams.get('to')) ?? new Date().toISOString();
  const fromParam = parseIsoOrNull(searchParams.get('from'));
  const fromIso =
    fromParam ?? new Date(new Date(toIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  let selectCols =
    'id, display_title, main_artist, song_title, style, play_count, created_at, music8_song_data';
  let { data, error } = await supabase
    .from('songs')
    .select(selectCols)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error?.code === '42703') {
    selectCols = 'id, display_title, main_artist, song_title, style, play_count, created_at';
    const retry = await supabase
      .from('songs')
      .select(selectCols)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        {
          error: 'songs テーブルがありません。',
          hint: 'docs/supabase-songs-and-performances-tables.md の SQL を実行してください。',
        },
        { status: 503 },
      );
    }
    console.error('[admin/songs-newly-registered] songs', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SongRow[];
  const truncated = rows.length >= MAX_ROWS;
  const songIds = rows.map((r) => r.id);
  const videoIdsBySong = await loadVideoIdsBySongId(supabase, songIds);

  const byDate = new Map<string, SongsNewlyRegisteredItem[]>();

  for (const row of rows) {
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
    if (!createdAt) continue;

    const dateKey = jstDateKeyFromPlayedAt(createdAt);
    const item: SongsNewlyRegisteredItem = {
      song_id: row.id,
      display_title: row.display_title ?? null,
      main_artist: row.main_artist ?? null,
      song_title: row.song_title ?? null,
      style: row.style ?? null,
      play_count: typeof row.play_count === 'number' ? row.play_count : 0,
      created_at: createdAt,
      has_music8: songRowHasPersistedMusic8(row.music8_song_data),
      video_ids: videoIdsBySong.get(row.id) ?? [],
      admin_song_href: `/admin/songs/${row.id}`,
    };

    const list = byDate.get(dateKey) ?? [];
    list.push(item);
    byDate.set(dateKey, list);
  }

  const daysOut: SongsNewlyRegisteredDay[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    }));

  const res = NextResponse.json({
    fromIso,
    toIso,
    truncated,
    total_songs: rows.length,
    days: daysOut,
  });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}
