import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  adminRegisteredSongsOrder,
  parseAdminRegisteredSongsScope,
  parseAdminRegisteredSongsSort,
} from '@/lib/admin-registered-songs-sort';
import type {
  AdminRegisteredSongListItem,
  AdminRegisteredSongsListResponse,
} from '@/lib/admin-registered-songs-list-types';
import {
  resolveRegisteredSongYoutubeId,
  type RegisteredSongVideoCandidate,
} from '@/lib/admin-registered-songs-youtube';

export const dynamic = 'force-dynamic';

export type {
  AdminRegisteredSongListItem,
  AdminRegisteredSongsListResponse,
} from '@/lib/admin-registered-songs-list-types';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const SELECT_WITH_INTRO =
  'id, main_artist, song_title, display_title, style, genres, created_at, original_release_date, catalog_published_at, catalog_scope, music8_video_id, music8_song_id, music8_intro, vocal, spotify_images';
const SELECT_NO_INTRO =
  'id, main_artist, song_title, display_title, style, genres, created_at, original_release_date, catalog_published_at, catalog_scope, music8_video_id, music8_song_id, vocal, spotify_images';

function clampPage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

function clampPageSize(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.max(10, Math.min(MAX_PAGE_SIZE, n));
}

async function attachYoutubeIdsFromSongVideos(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  items: AdminRegisteredSongListItem[],
): Promise<AdminRegisteredSongListItem[]> {
  const missingIds = items.filter((item) => !item.music8_video_id).map((item) => item.id);
  if (missingIds.length === 0) return items;

  const { data, error } = await admin
    .from('song_videos')
    .select('song_id, video_id, variant')
    .in('song_id', missingIds);
  if (error && error.code !== '42P01') {
    console.error('[admin/songs-registered-list] song_videos', error.message);
    return items;
  }

  const bySong = new Map<string, RegisteredSongVideoCandidate[]>();
  for (const raw of data ?? []) {
    const r = raw as { song_id?: string; video_id?: string; variant?: string | null };
    const songId = typeof r.song_id === 'string' ? r.song_id : '';
    const videoId = typeof r.video_id === 'string' ? r.video_id.trim() : '';
    if (!songId || !videoId) continue;
    const list = bySong.get(songId) ?? [];
    list.push({ videoId, variant: r.variant ?? null });
    bySong.set(songId, list);
  }

  return items.map((item) => {
    if (item.music8_video_id) return item;
    const youtubeId = resolveRegisteredSongYoutubeId({
      music8VideoId: item.music8_video_id,
      videos: bySong.get(item.id) ?? [],
    });
    return youtubeId ? { ...item, music8_video_id: youtubeId } : item;
  });
}

function parseGenres(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  }
  return [];
}

function mapRow(row: Record<string, unknown>): AdminRegisteredSongListItem {
  const intro = typeof row.music8_intro === 'string' ? row.music8_intro.trim() : '';
  return {
    id: String(row.id ?? ''),
    main_artist: typeof row.main_artist === 'string' ? row.main_artist : null,
    song_title: typeof row.song_title === 'string' ? row.song_title : null,
    display_title: typeof row.display_title === 'string' ? row.display_title : null,
    style: typeof row.style === 'string' ? row.style : null,
    genres: parseGenres(row.genres),
    vocal: typeof row.vocal === 'string' ? row.vocal : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    original_release_date: typeof row.original_release_date === 'string' ? row.original_release_date : null,
    catalog_published_at: typeof row.catalog_published_at === 'string' ? row.catalog_published_at : null,
    catalog_scope: typeof row.catalog_scope === 'string' ? row.catalog_scope : null,
    music8_video_id:
      typeof row.music8_video_id === 'string' && row.music8_video_id.trim()
        ? row.music8_video_id.trim()
        : null,
    music8_song_id:
      typeof row.music8_song_id === 'number' && Number.isFinite(row.music8_song_id)
        ? row.music8_song_id
        : null,
    has_intro: intro.length > 0,
    intro_preview: intro ? intro.slice(0, 80) : null,
    spotify_images: typeof row.spotify_images === 'string' && row.spotify_images.trim() ? row.spotify_images.trim() : null,
  };
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者クライアントを初期化できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const sort = parseAdminRegisteredSongsSort(searchParams.get('sort'));
  const scope = parseAdminRegisteredSongsScope(searchParams.get('scope'));
  const page = clampPage(searchParams.get('page'));
  const pageSize = clampPageSize(searchParams.get('pageSize'));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const order = adminRegisteredSongsOrder(sort);

  const applyFilters = (select: string) => {
    let query = admin.from('songs').select(select, { count: 'exact' });
    if (scope === 'western') {
      query = query.or('catalog_scope.eq.western,catalog_scope.is.null,catalog_scope.eq.unknown');
    } else if (scope === 'domestic') {
      query = query.eq('catalog_scope', 'domestic');
    }
    if (q) {
      const escaped = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const like = `%${escaped}%`;
      query = query.or(
        `display_title.ilike.${like},main_artist.ilike.${like},song_title.ilike.${like}`,
      );
    }
    return query
      .order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
      .range(from, to);
  };

  let { data, error, count } = await applyFilters(SELECT_WITH_INTRO);
  if (error && (error.code === '42703' || /music8_intro/i.test(error.message))) {
    const fallback = await applyFilters(SELECT_NO_INTRO);
    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    console.error('[admin/songs-registered-list]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = await attachYoutubeIdsFromSongVideos(
    admin,
    (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>)),
  );
  const body: AdminRegisteredSongsListResponse = {
    items,
    total: count ?? items.length,
    page,
    pageSize,
    sort,
    scope,
    q,
  };
  return NextResponse.json(body);
}
