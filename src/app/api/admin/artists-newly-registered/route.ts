import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-register';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const PAGE = 1000;

export type ArtistsNewlyRegisteredItem = {
  id: string;
  name: string | null;
  name_base: string | null;
  the_prefix: string | null;
  music8_artist_slug: string | null;
  created_at: string;
  admin_artist_href: string | null;
};

export type ArtistsNewlyRegisteredDay = {
  date: string;
  items: ArtistsNewlyRegisteredItem[];
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
  const pendingOnly = searchParams.get('pending_wp') !== '0';

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString();

  const rows: ArtistsNewlyRegisteredItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select('id, name, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[admin/artists-newly-registered]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    for (const r of data) {
      if (
        pendingOnly &&
        !isSelectionRegisteredArtistPendingWp(
          r as { music8_artist_id?: number | null; music8_synced_at?: string | null },
        )
      ) {
        continue;
      }
      const id = (r as { id: string }).id;
      const display =
        displayNameFromArtistRow(r as { name?: string; name_base?: string; the_prefix?: string }) ??
        (r as { name?: string }).name ??
        null;
      rows.push({
        id,
        name: display,
        name_base: (r as { name_base?: string }).name_base ?? null,
        the_prefix: (r as { the_prefix?: string }).the_prefix ?? null,
        music8_artist_slug: (r as { music8_artist_slug?: string }).music8_artist_slug ?? null,
        created_at: (r as { created_at: string }).created_at,
        admin_artist_href: (r as { music8_artist_slug?: string }).music8_artist_slug
          ? `/admin/library/artist?slug=${encodeURIComponent((r as { music8_artist_slug: string }).music8_artist_slug)}`
          : null,
      });
    }
    if (data.length < PAGE) break;
  }

  const byDay = new Map<string, ArtistsNewlyRegisteredItem[]>();
  for (const item of rows) {
    const key = jstDateKeyFromIso(item.created_at);
    const list = byDay.get(key) ?? [];
    list.push(item);
    byDay.set(key, list);
  }

  const dayGroups: ArtistsNewlyRegisteredDay[] = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));

  return NextResponse.json({
    days: dayGroups,
    total_items: rows.length,
    since_iso: sinceIso,
    pending_wp_only: pendingOnly,
  });
}
