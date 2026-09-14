import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAdminRegisteredSongsScope } from '@/lib/admin-registered-songs-sort';
import {
  buildAdminRegisteredSongsMonthlyDashboard,
  jstYearMonthFromIso,
  originalReleaseDateYearBounds,
  parseAdminRegisteredSongsMonthlyYear,
  publicReleaseTimestampIso,
  type AdminRegisteredSongMonthlyRow,
  type AdminRegisteredSongsMonthlyDashboard,
} from '@/lib/admin-registered-songs-monthly';

export const dynamic = 'force-dynamic';

export type { AdminRegisteredSongsMonthlyDashboard };

const PAGE_SIZE = 1000;
const STYLE_BATCH = 1000;
const DASH_CACHE_TTL_MS = 120_000;

const dashCache = new Map<string, { expiresAt: number; body: AdminRegisteredSongsMonthlyDashboard }>();

function dashCacheKey(year: number, scope: string): string {
  return `${year}:${scope}`;
}

function getCachedDashboard(key: string): AdminRegisteredSongsMonthlyDashboard | null {
  const hit = dashCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    dashCache.delete(key);
    return null;
  }
  return hit.body;
}

async function fetchMonthlySongRows(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  scope: 'all' | 'western' | 'domestic',
  year: number,
): Promise<{ rows: AdminRegisteredSongMonthlyRow[]; error: string | null }> {
  const rows: AdminRegisteredSongMonthlyRow[] = [];
  const bounds = originalReleaseDateYearBounds(year);
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from('songs')
      .select('id, style, original_release_date')
      .not('original_release_date', 'is', null)
      .gte('original_release_date', bounds.gte)
      .lte('original_release_date', bounds.lte)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (scope === 'western') {
      query = query.or('catalog_scope.eq.western,catalog_scope.is.null,catalog_scope.eq.unknown');
    } else if (scope === 'domestic') {
      query = query.eq('catalog_scope', 'domestic');
    }
    const { data, error } = await query;
    if (error) {
      console.error('[admin/songs-registered-monthly] songs', error.message);
      return { rows: [], error: error.message };
    }
    const chunk = (data ?? []) as AdminRegisteredSongMonthlyRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

async function fetchCatalogStyleBySongId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songIds: string[],
): Promise<Map<string, string>> {
  const styleBySong = new Map<string, string>();
  for (let i = 0; i < songIds.length; i += STYLE_BATCH) {
    const slice = songIds.slice(i, i + STYLE_BATCH);
    const { data, error } = await admin
      .from('song_styles')
      .select('song_id, catalog_styles(slug)')
      .in('song_id', slice);
    if (error) {
      if (error.code !== '42P01' && error.code !== '42703') {
        console.warn('[admin/songs-registered-monthly] song_styles', error.message);
      }
      return styleBySong;
    }
    for (const r of (data ?? []) as {
      song_id?: string;
      catalog_styles?: { slug?: string } | { slug?: string }[] | null;
    }[]) {
      if (!r.song_id || styleBySong.has(r.song_id)) continue;
      const nested = r.catalog_styles;
      const slug = Array.isArray(nested) ? nested[0]?.slug : nested?.slug;
      if (slug) styleBySong.set(r.song_id, slug);
    }
  }
  return styleBySong;
}

export async function GET(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者クライアントを初期化できません。' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseAdminRegisteredSongsMonthlyYear(searchParams.get('year'));
  const scope = parseAdminRegisteredSongsScope(searchParams.get('scope') ?? 'western');
  const cacheKey = dashCacheKey(year, scope);
  const cached = getCachedDashboard(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  }

  const fetched = await fetchMonthlySongRows(admin, scope, year);
  if (fetched.error) {
    return NextResponse.json({ error: fetched.error }, { status: 500 });
  }

  const yearRows = fetched.rows.filter((row) => jstYearMonthFromIso(publicReleaseTimestampIso(row))?.year === year);
  const catalogStyleBySongId = await fetchCatalogStyleBySongId(
    admin,
    yearRows.map((r) => r.id),
  );
  const body: AdminRegisteredSongsMonthlyDashboard = buildAdminRegisteredSongsMonthlyDashboard({
    year,
    songs: yearRows,
    catalogStyleBySongId,
  });
  dashCache.set(cacheKey, { expiresAt: Date.now() + DASH_CACHE_TTL_MS, body });
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
