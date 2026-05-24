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
const PAGE_SIZE = 1000;
const MAX_SCAN_ROWS = 30_000;
/** 選曲時刻と songs.created_at の差がこの以内なら「新規登録」 */
const NEW_REGISTRATION_WINDOW_MS = 5 * 60 * 1000;

export type SongRegistrationKind = 'new' | 'existing';

export type SongsNewlyRegisteredItem = {
  registration_kind: SongRegistrationKind;
  played_at: string;
  video_id: string;
  song_id: string | null;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  style: string | null;
  play_count: number | null;
  song_created_at: string | null;
  has_music8: boolean;
  room_id: string;
  room_display_title: string;
  selector_display_name: string | null;
  admin_song_href: string | null;
};

export type SongsNewlyRegisteredDay = {
  date: string;
  items: SongsNewlyRegisteredItem[];
};

type HistoryScanRow = {
  played_at: string;
  video_id: string;
  room_id: string;
  display_name: string | null;
  title: string | null;
  artist_name: string | null;
};

type SongMeta = {
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

function parseKind(raw: string | null): 'all' | 'new' {
  return raw === 'new' ? 'new' : 'all';
}

function isNewRegistrationAtPlay(songCreatedAt: string, playedAt: string): boolean {
  const createdMs = Date.parse(songCreatedAt);
  const playedMs = Date.parse(playedAt);
  if (Number.isNaN(createdMs) || Number.isNaN(playedMs)) return false;
  return Math.abs(playedMs - createdMs) <= NEW_REGISTRATION_WINDOW_MS;
}

function snapshotDisplayTitle(row: HistoryScanRow): string | null {
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const artist = typeof row.artist_name === 'string' ? row.artist_name.trim() : '';
  if (artist && title) return `${artist} - ${title}`;
  return title || artist || null;
}

async function loadSongMetaByVideoId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  videoIds: string[],
): Promise<Map<string, SongMeta>> {
  const out = new Map<string, SongMeta>();
  const unique = [...new Set(videoIds.filter(Boolean))];
  if (unique.length === 0) return out;

  const vidToSongId = new Map<string, string>();
  for (const chunk of chunkArray(unique, 120)) {
    const { data, error } = await admin
      .from('song_videos')
      .select('video_id, song_id')
      .in('video_id', chunk);
    if (error) {
      if (error.code === '42P01') return out;
      console.error('[admin/songs-newly-registered] song_videos', error);
      continue;
    }
    for (const row of (data ?? []) as { video_id?: string; song_id?: string }[]) {
      const vid = typeof row.video_id === 'string' ? row.video_id.trim() : '';
      const sid = typeof row.song_id === 'string' ? row.song_id.trim() : '';
      if (vid && sid && !vidToSongId.has(vid)) vidToSongId.set(vid, sid);
    }
  }

  const songIds = [...new Set(vidToSongId.values())];
  const songById = new Map<string, SongMeta>();
  for (const chunk of chunkArray(songIds, 120)) {
    const primary = await admin
      .from('songs')
      .select(
        'id, display_title, main_artist, song_title, style, play_count, created_at, music8_song_data',
      )
      .in('id', chunk);

    let songRows: SongMeta[];
    if (primary.error?.code === '42703') {
      const fallback = await admin
        .from('songs')
        .select('id, display_title, main_artist, song_title, style, play_count, created_at')
        .in('id', chunk);
      if (fallback.error) {
        if (fallback.error.code === '42P01') return out;
        console.error('[admin/songs-newly-registered] songs', fallback.error);
        continue;
      }
      songRows = (fallback.data ?? []) as SongMeta[];
    } else {
      if (primary.error) {
        if (primary.error.code === '42P01') return out;
        console.error('[admin/songs-newly-registered] songs', primary.error);
        continue;
      }
      songRows = (primary.data ?? []) as SongMeta[];
    }

    for (const row of songRows) {
      if (row.id) songById.set(row.id, row);
    }
  }

  for (const [vid, sid] of vidToSongId) {
    const song = songById.get(sid);
    if (song) out.set(vid, song);
  }
  return out;
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
 * GET: 期間内の room_playback_history を JST 日付別に返す。
 * 各行は選曲1回。registration_kind は songs.created_at が選曲時刻に近いかで判定。
 * Query: days=1..90, from=ISO, to=ISO, kind=all|new（既定 all）
 */
export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get('days'));
  const kind = parseKind(searchParams.get('kind'));
  const toIso = parseIsoOrNull(searchParams.get('to')) ?? new Date().toISOString();
  const fromParam = parseIsoOrNull(searchParams.get('from'));
  const fromIso =
    fromParam ?? new Date(new Date(toIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const historyRows: HistoryScanRow[] = [];
  let scanned = 0;
  let truncated = false;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('room_playback_history')
      .select('played_at, video_id, room_id, display_name, title, artist_name')
      .gte('played_at', fromIso)
      .lte('played_at', toIso)
      .order('played_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json(
          {
            error: 'room_playback_history テーブルがありません。',
            hint: 'docs/supabase-room-playback-history-table.md の SQL を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[admin/songs-newly-registered] scan', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = (data ?? []) as HistoryScanRow[];
    historyRows.push(...batch);
    scanned += batch.length;
    if (batch.length < PAGE_SIZE) break;
    if (scanned >= MAX_SCAN_ROWS) {
      truncated = true;
      break;
    }
  }

  const videoIds = historyRows
    .map((r) => (typeof r.video_id === 'string' ? r.video_id.trim() : ''))
    .filter(Boolean);
  const songMetaByVideo = await loadSongMetaByVideoId(admin, videoIds);
  const roomIds = historyRows
    .map((r) => (typeof r.room_id === 'string' ? r.room_id.trim() : ''))
    .filter(Boolean);
  const roomTitleMap = await loadRoomDisplayTitles(admin, roomIds);

  const byDate = new Map<string, SongsNewlyRegisteredItem[]>();
  let newCount = 0;
  let existingCount = 0;

  for (const row of historyRows) {
    const playedAt = typeof row.played_at === 'string' ? row.played_at : '';
    const videoId = typeof row.video_id === 'string' ? row.video_id.trim() : '';
    const roomId = typeof row.room_id === 'string' ? row.room_id.trim() : '';
    if (!playedAt || !videoId || !roomId) continue;

    const song = songMetaByVideo.get(videoId) ?? null;
    const registrationKind: SongRegistrationKind =
      song && isNewRegistrationAtPlay(song.created_at, playedAt) ? 'new' : 'existing';

    if (kind === 'new' && registrationKind !== 'new') continue;

    if (registrationKind === 'new') newCount += 1;
    else existingCount += 1;

    const dateKey = jstDateKeyFromPlayedAt(playedAt);
    const item: SongsNewlyRegisteredItem = {
      registration_kind: registrationKind,
      played_at: playedAt,
      video_id: videoId,
      song_id: song?.id ?? null,
      display_title: song?.display_title ?? snapshotDisplayTitle(row),
      main_artist: song?.main_artist ?? row.artist_name ?? null,
      song_title: song?.song_title ?? row.title ?? null,
      style: song?.style ?? null,
      play_count: song?.play_count ?? null,
      song_created_at: song?.created_at ?? null,
      has_music8: song ? songRowHasPersistedMusic8(song.music8_song_data) : false,
      room_id: roomId,
      room_display_title: roomTitleMap.get(roomId) ?? roomId,
      selector_display_name: (row.display_name ?? '').trim() || null,
      admin_song_href: song?.id ? `/admin/songs/${song.id}` : null,
    };

    const list = byDate.get(dateKey) ?? [];
    list.push(item);
    byDate.set(dateKey, list);
  }

  const daysOut: SongsNewlyRegisteredDay[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.played_at < b.played_at ? 1 : -1)),
    }));

  const res = NextResponse.json({
    fromIso,
    toIso,
    kind,
    truncated,
    scanned_rows: scanned,
    total_items: newCount + existingCount,
    new_count: newCount,
    existing_count: existingCount,
    days: daysOut,
  });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}
