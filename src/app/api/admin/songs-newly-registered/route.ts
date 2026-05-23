import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
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
  room_id: string | null;
  room_display_title: string | null;
  selector_display_name: string | null;
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

type PlaybackRow = {
  video_id: string;
  room_id: string;
  display_name: string | null;
  played_at: string;
};

async function loadPlaybackRowsInRange(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  videoIds: string[],
  fromIso: string,
  toIso: string,
): Promise<Map<string, PlaybackRow[]>> {
  const byVideo = new Map<string, PlaybackRow[]>();
  const unique = [...new Set(videoIds.filter(Boolean))];
  if (unique.length === 0) return byVideo;

  for (const chunk of chunkArray(unique, 120)) {
    const { data, error } = await admin
      .from('room_playback_history')
      .select('video_id, room_id, display_name, played_at')
      .in('video_id', chunk)
      .gte('played_at', fromIso)
      .lte('played_at', toIso)
      .order('played_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') return byVideo;
      console.error('[admin/songs-newly-registered] room_playback_history', error);
      continue;
    }

    for (const raw of (data ?? []) as PlaybackRow[]) {
      const vid = typeof raw.video_id === 'string' ? raw.video_id.trim() : '';
      const roomId = typeof raw.room_id === 'string' ? raw.room_id.trim() : '';
      const playedAt = typeof raw.played_at === 'string' ? raw.played_at : '';
      if (!vid || !roomId || !playedAt) continue;
      const list = byVideo.get(vid) ?? [];
      list.push({
        video_id: vid,
        room_id: roomId,
        display_name: typeof raw.display_name === 'string' ? raw.display_name : null,
        played_at: playedAt,
      });
      byVideo.set(vid, list);
    }
  }

  return byVideo;
}

function pickPlaybackForSong(rows: PlaybackRow[] | undefined, createdAt: string): PlaybackRow | null {
  if (!rows?.length) return null;
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return rows[0];

  let best = rows[0];
  let bestDist = Math.abs(Date.parse(best.played_at) - createdMs);
  for (const row of rows.slice(1)) {
    const dist = Math.abs(Date.parse(row.played_at) - createdMs);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

async function loadRoomDisplayTitles(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  roomIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(roomIds.filter(Boolean))];
  if (unique.length === 0) return out;

  for (const chunk of chunkArray(unique, 120)) {
    const { data, error } = await admin
      .from('room_lobby_message')
      .select('room_id, display_title')
      .in('room_id', chunk);

    if (error) {
      if (error.code === '42P01') return out;
      console.error('[admin/songs-newly-registered] room_lobby_message', error);
      continue;
    }

    for (const row of (data ?? []) as { room_id?: string; display_title?: string | null }[]) {
      const rid = typeof row.room_id === 'string' ? row.room_id.trim() : '';
      if (!rid || out.has(rid)) continue;
      const title = typeof row.display_title === 'string' ? row.display_title.trim() : '';
      out.set(rid, title || rid);
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

  const primary = await supabase
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, style, play_count, created_at, music8_song_data',
    )
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  let rows: SongRow[];
  let error = primary.error;

  if (primary.error?.code === '42703') {
    const fallback = await supabase
      .from('songs')
      .select('id, display_title, main_artist, song_title, style, play_count, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    rows = (fallback.data ?? []) as SongRow[];
    error = fallback.error;
  } else {
    rows = (primary.data ?? []) as SongRow[];
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

  const truncated = rows.length >= MAX_ROWS;
  const songIds = rows.map((r) => r.id);
  const videoIdsBySong = await loadVideoIdsBySongId(supabase, songIds);

  const allVideoIds = [...new Set([...videoIdsBySong.values()].flat())];
  const admin = createAdminClient();
  const playbackByVideo =
    admin != null ? await loadPlaybackRowsInRange(admin, allVideoIds, fromIso, toIso) : new Map();
  const roomIdsForTitles = [
    ...new Set(
      [...playbackByVideo.values()]
        .flat()
        .map((row) => row.room_id)
        .filter(Boolean),
    ),
  ];
  const roomTitleMap =
    admin != null ? await loadRoomDisplayTitles(admin, roomIdsForTitles) : new Map<string, string>();

  const byDate = new Map<string, SongsNewlyRegisteredItem[]>();

  for (const row of rows) {
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
    if (!createdAt) continue;

    const videoIds = videoIdsBySong.get(row.id) ?? [];
    const primaryVideoId = videoIds[0] ?? null;
    const playback = primaryVideoId ? pickPlaybackForSong(playbackByVideo.get(primaryVideoId), createdAt) : null;
    const roomId = playback?.room_id ?? null;

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
      video_ids: videoIds,
      room_id: roomId,
      room_display_title: roomId ? (roomTitleMap.get(roomId) ?? roomId) : null,
      selector_display_name: playback
        ? (playback.display_name ?? '').trim() || null
        : null,
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
