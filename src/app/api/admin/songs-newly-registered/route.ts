import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  chunkArray,
  jstDateKeyFromPlayedAt,
  songRowHasPersistedMusic8,
} from '@/lib/admin-music8-pending';
import {
  loadAdminRoomLabelMaps,
  resolveAdminRoomDisplayTitle,
  resolveAdminRoomLobbySubtitle,
} from '@/lib/admin-room-display-label';
import {
  normalizeRoomHistoryProduct,
  parseAdminProductFilter,
  runAdminHistoryQueryScoped,
} from '@/lib/room-history-product';
import { isAdminSongJapaneseDomesticDisplay } from '@/lib/song-catalog-scope';
import {
  playbackHistorySongTitleOnly,
  snapshotPlaybackHistoryDisplayTitle,
} from '@/lib/playback-history-display-title';
import { ensureDomesticJpArtistCache } from '@/lib/domestic-jp-artists';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';

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
  room_product: string;
  room_display_title: string;
  /** 会タイトルとロビー固定名が異なるときのみ */
  room_lobby_subtitle: string | null;
  selector_display_name: string | null;
  admin_song_href: string | null;
  is_japanese_domestic: boolean;
  original_release_date: string | null;
  genres: string[];
};

export type SongsNewlyRegisteredDay = {
  date: string;
  items: SongsNewlyRegisteredItem[];
};

type HistoryScanRow = {
  played_at: string;
  video_id: string;
  room_id: string;
  product: string;
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
  catalog_scope?: string | null;
  original_release_date?: string | null;
  genres?: string[] | null;
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

function parseCatalogFilter(raw: string | null): 'western' | 'domestic' {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'domestic' || v === 'jp' || v === 'japanese') return 'domestic';
  return 'western';
}

function isNewRegistrationAtPlay(songCreatedAt: string, playedAt: string): boolean {
  const createdMs = Date.parse(songCreatedAt);
  const playedMs = Date.parse(playedAt);
  if (Number.isNaN(createdMs) || Number.isNaN(playedMs)) return false;
  return Math.abs(playedMs - createdMs) <= NEW_REGISTRATION_WINDOW_MS;
}

function snapshotDisplayTitle(row: HistoryScanRow): string | null {
  return snapshotPlaybackHistoryDisplayTitle(row.title, row.artist_name);
}

function historySongTitle(row: HistoryScanRow, song: SongMeta | null): string | null {
  if (song?.song_title?.trim()) return song.song_title.trim();
  return playbackHistorySongTitleOnly(row.title, row.artist_name);
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
        'id, display_title, main_artist, song_title, style, play_count, created_at, music8_song_data, catalog_scope, original_release_date, genres',
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

/**
 * GET: 期間内の room_playback_history を JST 日付別に返す。
 * 各行は選曲1回。registration_kind は songs.created_at が選曲時刻に近いかで判定。
 * Query: days=1..90, from=ISO, to=ISO, kind=all|new（既定 all）, catalog=western|domestic（未指定は western＝邦楽除外）
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
  const catalogFilter = parseCatalogFilter(searchParams.get('catalog'));
  const productFilter = parseAdminProductFilter(searchParams.get('product'));
  const toIso = parseIsoOrNull(searchParams.get('to')) ?? new Date().toISOString();
  const fromParam = parseIsoOrNull(searchParams.get('from'));
  const fromIso =
    fromParam ?? new Date(new Date(toIso).getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const historyRows: HistoryScanRow[] = [];
  let scanned = 0;
  let truncated = false;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const scanRes = await runAdminHistoryQueryScoped((applyProductEq, scopedProduct) => {
      let q = admin
        .from('room_playback_history')
        .select('played_at, video_id, room_id, product, display_name, title, artist_name')
        .gte('played_at', fromIso)
        .lte('played_at', toIso)
        .order('played_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (applyProductEq && scopedProduct) {
        q = q.eq('product', scopedProduct);
      }
      return q;
    }, productFilter);

    const { data, error } = scanRes;

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

    const batch = (data ?? []).map((row) => ({
      ...(row as Omit<HistoryScanRow, 'product'>),
      product: normalizeRoomHistoryProduct((row as { product?: string }).product),
    })) as HistoryScanRow[];
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
  await ensureWesternTreatedJpArtistCache();
  await ensureDomesticJpArtistCache();
  const roomIds = historyRows
    .map((r) => (typeof r.room_id === 'string' ? r.room_id.trim() : ''))
    .filter(Boolean);
  const roomLabelMaps = await loadAdminRoomLabelMaps(admin, roomIds, { fromIso, toIso });

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

    const isJapaneseDomestic = isAdminSongJapaneseDomesticDisplay({
      catalog_scope: song?.catalog_scope ?? null,
      main_artist: song?.main_artist ?? row.artist_name ?? null,
      song_title: song?.song_title ?? row.title ?? null,
      display_title: song?.display_title ?? snapshotDisplayTitle(row),
    });
    if (catalogFilter === 'domestic' && !isJapaneseDomestic) continue;
    if (catalogFilter === 'western' && isJapaneseDomestic) continue;

    if (registrationKind === 'new') newCount += 1;
    else existingCount += 1;

    const dateKey = jstDateKeyFromPlayedAt(playedAt);
    const rowProduct = normalizeRoomHistoryProduct(row.product);
    const roomDisplayTitle = resolveAdminRoomDisplayTitle(
      roomLabelMaps,
      roomId,
      playedAt,
      rowProduct,
    );
    const item: SongsNewlyRegisteredItem = {
      registration_kind: registrationKind,
      played_at: playedAt,
      video_id: videoId,
      song_id: song?.id ?? null,
      display_title: song?.display_title ?? snapshotDisplayTitle(row),
      main_artist: song?.main_artist ?? row.artist_name ?? null,
      song_title: historySongTitle(row, song),
      style: song?.style ?? null,
      play_count: song?.play_count ?? null,
      song_created_at: song?.created_at ?? null,
      has_music8: song ? songRowHasPersistedMusic8(song.music8_song_data) : false,
      room_id: roomId,
      room_product: rowProduct,
      room_display_title: roomDisplayTitle,
      room_lobby_subtitle: resolveAdminRoomLobbySubtitle(roomLabelMaps, roomId, roomDisplayTitle),
      selector_display_name: (row.display_name ?? '').trim() || null,
      admin_song_href: song?.id ? `/admin/songs/${song.id}` : null,
      is_japanese_domestic: isJapaneseDomestic,
      original_release_date: song?.original_release_date ?? null,
      genres: Array.isArray(song?.genres)
        ? song!.genres!.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        : [],
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
    catalog: catalogFilter,
    product: productFilter,
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
