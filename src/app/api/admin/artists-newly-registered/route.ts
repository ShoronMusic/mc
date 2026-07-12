import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-register';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';
import {
  findHighConfidenceMergePairs,
  loadArtistsForMergeScan,
  type ArtistMergeRow,
} from '@/lib/admin-artist-merge';

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
  /** 正本がありマージ候補のとき（非表示フィルタ用） */
  superseded_by?: { id: string; name: string | null } | null;
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

function isEstablishedKeep(row: ArtistMergeRow): boolean {
  if (row.music8_artist_id != null) return true;
  if (row.music8_synced_at) return true;
  if (row.spotify_artist_id?.trim()) return true;
  if (row.profile_text && row.profile_text.trim().length >= 40) return true;
  if (row.name_ja?.trim() && row.name_en?.trim()) return true;
  const slug = row.music8_artist_slug?.trim() ?? '';
  if (slug && !slug.startsWith('jp-')) return true;
  return false;
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
  /** 正本がある重複行を一覧から隠す（既定オン） */
  const hideSuperseded = searchParams.get('hide_superseded') !== '0';

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString();

  const rawRows: Array<{
    id: string;
    name: string | null;
    name_ja?: string | null;
    name_en?: string | null;
    name_base: string | null;
    the_prefix: string | null;
    music8_artist_slug: string | null;
    music8_artist_id?: number | null;
    music8_synced_at?: string | null;
    spotify_artist_id?: string | null;
    profile_text?: string | null;
    created_at: string;
  }> = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select(
        'id, name, name_ja, name_en, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, spotify_artist_id, profile_text, created_at',
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42703') {
        const { data: d2, error: e2 } = await admin
          .from('artists')
          .select(
            'id, name, name_ja, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at, created_at',
          )
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (e2) {
          console.error('[admin/artists-newly-registered]', e2);
          return NextResponse.json({ error: e2.message }, { status: 500 });
        }
        if (!d2?.length) break;
        for (const r of d2) {
          if (
            pendingOnly &&
            !isSelectionRegisteredArtistPendingWp(
              r as { music8_artist_id?: number | null; music8_synced_at?: string | null },
            )
          ) {
            continue;
          }
          rawRows.push(r as (typeof rawRows)[number]);
        }
        if (d2.length < PAGE) break;
        continue;
      }
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
      rawRows.push(r as (typeof rawRows)[number]);
    }
    if (data.length < PAGE) break;
  }

  // 正本照合用に広めの artists を読み、高信頼ペアの lose を特定
  const pool = await loadArtistsForMergeScan(admin, { limit: 8000 });
  const pairs = findHighConfidenceMergePairs(pool);
  const superseded = new Map<string, { id: string; name: string | null }>();
  for (const p of pairs) {
    if (!isEstablishedKeep(p.keep)) continue;
    superseded.set(p.lose.id, { id: p.keep.id, name: p.keep.name ?? null });
  }

  let hiddenSuperseded = 0;
  const rows: ArtistsNewlyRegisteredItem[] = [];
  for (const r of rawRows) {
    const display =
      displayNameFromArtistRow(r as { name?: string; name_base?: string; the_prefix?: string }) ??
      r.name ??
      null;
    const sup = superseded.get(r.id) ?? null;
    if (hideSuperseded && sup) {
      hiddenSuperseded += 1;
      continue;
    }
    rows.push({
      id: r.id,
      name: display,
      name_base: r.name_base ?? null,
      the_prefix: r.the_prefix ?? null,
      music8_artist_slug: r.music8_artist_slug ?? null,
      created_at: r.created_at,
      admin_artist_href: (() => {
        const slug = r.music8_artist_slug?.trim();
        if (display?.trim()) {
          return `/admin/library/artist?name=${encodeURIComponent(display.trim())}`;
        }
        if (slug) {
          return `/admin/library/artist?slug=${encodeURIComponent(slug)}`;
        }
        return null;
      })(),
      superseded_by: sup,
    });
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
    hidden_superseded: hiddenSuperseded,
    since_iso: sinceIso,
    pending_wp_only: pendingOnly,
    hide_superseded: hideSuperseded,
  });
}
