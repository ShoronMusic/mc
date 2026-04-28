import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  chunkArray,
  jstDateKeyFromPlayedAt,
  songRowHasPersistedMusic8,
} from '@/lib/admin-music8-pending';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const MAX_SCAN_ROWS = 30_000;

export type LibraryMusic8PendingItem = {
  video_id: string;
  song_id: string | null;
  first_played_at: string;
  last_played_at: string;
  playback_count: number;
  title: string | null;
  artist_name: string | null;
  sample_room_id: string | null;
  youtube_url: string;
  admin_song_href: string | null;
};

export type LibraryMusic8PendingDay = {
  date: string;
  items: LibraryMusic8PendingItem[];
};

type PlaybackScanRow = {
  played_at: string;
  video_id: string;
  title: string | null;
  artist_name: string | null;
  room_id: string | null;
};

type CellAgg = {
  video_id: string;
  first_played_at: string;
  last_played_at: string;
  playback_count: number;
  title: string | null;
  artist_name: string | null;
  sample_room_id: string | null;
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

async function loadVideoMusic8Flags(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  videoIds: string[],
): Promise<Map<string, { songId: string | null; hasMusic8: boolean }>> {
  const out = new Map<string, { songId: string | null; hasMusic8: boolean }>();
  if (videoIds.length === 0) return out;

  const vidToSongId = new Map<string, string>();
  for (const chunk of chunkArray(videoIds, 120)) {
    const { data: svRows, error: svErr } = await admin
      .from('song_videos')
      .select('video_id, song_id')
      .in('video_id', chunk);
    if (svErr && svErr.code !== '42P01') {
      console.error('[admin/library-music8-pending] song_videos', svErr);
    }
    for (const r of (svRows ?? []) as { video_id?: string; song_id?: string }[]) {
      const vid = typeof r.video_id === 'string' ? r.video_id.trim() : '';
      const sid = typeof r.song_id === 'string' ? r.song_id.trim() : '';
      if (vid && sid && !vidToSongId.has(vid)) vidToSongId.set(vid, sid);
    }
  }

  const songIds = [...new Set(vidToSongId.values())];
  const songHasM8 = new Map<string, boolean>();
  for (const chunk of chunkArray(songIds, 120)) {
    const { data: songRows, error: songErr } = await admin
      .from('songs')
      .select('id, music8_song_data')
      .in('id', chunk);
    if (songErr && songErr.code !== '42P01' && songErr.code !== '42703') {
      console.error('[admin/library-music8-pending] songs', songErr);
    }
    for (const s of (songRows ?? []) as { id?: string; music8_song_data?: unknown }[]) {
      const id = typeof s.id === 'string' ? s.id : '';
      if (id) songHasM8.set(id, songRowHasPersistedMusic8(s.music8_song_data));
    }
  }

  for (const vid of videoIds) {
    const sid = vidToSongId.get(vid) ?? null;
    out.set(vid, {
      songId: sid,
      hasMusic8: sid ? (songHasM8.get(sid) ?? false) : false,
    });
  }
  return out;
}

/**
 * GET: 指定期間の視聴履歴から、Music8 スナップショット未保存の `video_id` を JST 日付別に返す。
 * Query: days=1..90（既定 14）, from=ISO, to=ISO（省略時は to=現在・from=to-days）
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
  const toIso = parseIsoOrNull(searchParams.get('to')) ?? new Date().toISOString();
  const fromParam = parseIsoOrNull(searchParams.get('from'));
  const fromIso =
    fromParam ?? new Date(new Date(toIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows: PlaybackScanRow[] = [];
  let scanned = 0;
  let truncated = false;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from('room_playback_history')
      .select('played_at, video_id, title, artist_name, room_id')
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
      console.error('[admin/library-music8-pending] scan', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = (data ?? []) as PlaybackScanRow[];
    rows.push(...batch);
    scanned += batch.length;
    if (batch.length < PAGE_SIZE) break;
    if (scanned >= MAX_SCAN_ROWS) {
      truncated = true;
      break;
    }
  }

  /** JST 日付 → video_id → 集計（走査は played_at 降順） */
  const byDate = new Map<string, Map<string, CellAgg>>();

  for (const r of rows) {
    const vid = typeof r.video_id === 'string' ? r.video_id.trim() : '';
    const playedAt = typeof r.played_at === 'string' ? r.played_at : '';
    if (!vid || !playedAt) continue;

    const dateKey = jstDateKeyFromPlayedAt(playedAt);
    let inner = byDate.get(dateKey);
    if (!inner) {
      inner = new Map();
      byDate.set(dateKey, inner);
    }

    const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null;
    const artistName =
      typeof r.artist_name === 'string' && r.artist_name.trim() ? r.artist_name.trim() : null;
    const roomId = typeof r.room_id === 'string' && r.room_id.trim() ? r.room_id.trim() : null;

    const cell = inner.get(vid);
    if (!cell) {
      inner.set(vid, {
        video_id: vid,
        first_played_at: playedAt,
        last_played_at: playedAt,
        playback_count: 1,
        title,
        artist_name: artistName,
        sample_room_id: roomId,
      });
    } else {
      cell.playback_count += 1;
      if (playedAt < cell.first_played_at) cell.first_played_at = playedAt;
      if (playedAt > cell.last_played_at) cell.last_played_at = playedAt;
    }
  }

  const allVideoIds = new Set<string>();
  for (const m of byDate.values()) {
    for (const vid of m.keys()) allVideoIds.add(vid);
  }

  const flags = await loadVideoMusic8Flags(admin, [...allVideoIds]);

  const daysOut: LibraryMusic8PendingDay[] = [];
  const sortedDates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  for (const date of sortedDates) {
    const inner = byDate.get(date)!;
    const items: LibraryMusic8PendingItem[] = [];
    for (const cell of inner.values()) {
      const f = flags.get(cell.video_id);
      if (f?.hasMusic8) continue;

      items.push({
        video_id: cell.video_id,
        song_id: f?.songId ?? null,
        first_played_at: cell.first_played_at,
        last_played_at: cell.last_played_at,
        playback_count: cell.playback_count,
        title: cell.title,
        artist_name: cell.artist_name,
        sample_room_id: cell.sample_room_id,
        youtube_url: `https://www.youtube.com/watch?v=${encodeURIComponent(cell.video_id)}`,
        admin_song_href: f?.songId ? `/admin/songs/${f.songId}` : null,
      });
    }

    items.sort((a, b) => (a.last_played_at < b.last_played_at ? 1 : -1));
    if (items.length > 0) {
      daysOut.push({ date, items });
    }
  }

  const res = NextResponse.json({
    fromIso,
    toIso,
    truncated,
    scanned_rows: scanned,
    days: daysOut,
  });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res;
}
