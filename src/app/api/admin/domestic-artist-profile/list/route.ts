import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { buildNameSort } from '@/lib/music8-artist-import';
import {
  resolveDomesticArtistRegistrationStatus,
  type DomesticArtistRegistrationStatus,
} from '@/lib/admin-domestic-artist-registration-status';
import { songMainArtistIncludesArtist } from '@/lib/library-search-query';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

export type DomesticRegisteredArtistListItem = {
  id: string;
  name: string;
  nameJa: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
  status: DomesticArtistRegistrationStatus;
  /** 邦楽 catalog の登録曲数（main_artist / song_credits） */
  songCount: number;
};

type ArtistRow = {
  id?: string;
  name?: string | null;
  name_ja?: string | null;
  name_sort?: string | null;
  image_url?: string | null;
  spotify_artist_images?: string | null;
  updated_at?: string | null;
  description_en?: string | null;
  profile_text?: string | null;
  ai_profile_generated_at?: string | null;
  ai_profile_source?: string | null;
  origin_country?: string | null;
  active_period?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  occupations?: string[] | null;
  kind?: string | null;
  spotify_artist_id?: string | null;
  youtube_channel_id?: string | null;
  wikipedia_page?: string | null;
};

function sortKey(row: ArtistRow): string {
  const fromCol = typeof row.name_sort === 'string' ? row.name_sort.trim() : '';
  if (fromCol) return fromCol.toLowerCase();
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  return name ? buildNameSort(name) : '';
}

function toListItem(
  row: ArtistRow,
  songCount: number,
): DomesticRegisteredArtistListItem | null {
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!id || !name) return null;
  const imageUrl =
    (typeof row.spotify_artist_images === 'string' && row.spotify_artist_images.trim()) ||
    (typeof row.image_url === 'string' && row.image_url.trim()) ||
    null;
  return {
    id,
    name,
    nameJa: typeof row.name_ja === 'string' && row.name_ja.trim() ? row.name_ja.trim() : null,
    imageUrl,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    status: resolveDomesticArtistRegistrationStatus(row),
    songCount,
  };
}

/** 邦楽曲を main_artist / song_credits からアーティスト別に集計 */
async function countDomesticSongsByArtists(
  admin: SupabaseClient,
  artists: { id: string; name: string }[],
): Promise<Map<string, number>> {
  const songSets = new Map<string, Set<string>>();
  for (const a of artists) songSets.set(a.id, new Set());
  if (artists.length === 0) return new Map();

  const domesticSongIds = new Set<string>();
  const songMainById = new Map<string, string | null>();

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist')
      .eq('catalog_scope', 'domestic')
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn('[admin/domestic-artist-profile/list] songs count', error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data as { id?: string; main_artist?: string | null }[]) {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) continue;
      domesticSongIds.add(id);
      songMainById.set(id, row.main_artist ?? null);
    }
    if (data.length < PAGE) break;
  }

  for (const a of artists) {
    const set = songSets.get(a.id)!;
    for (const [songId, main] of songMainById) {
      if (songMainArtistIncludesArtist(main, a.name)) set.add(songId);
    }
  }

  const artistIds = artists.map((a) => a.id);
  for (let i = 0; i < artistIds.length; i += 100) {
    const chunk = artistIds.slice(i, i + 100);
    const { data: credits, error: cErr } = await admin
      .from('song_credits')
      .select('song_id, artist_id')
      .in('artist_id', chunk);
    if (cErr) {
      if (cErr.code !== '42P01') {
        console.warn('[admin/domestic-artist-profile/list] song_credits', cErr.message);
      }
      continue;
    }
    for (const row of (credits ?? []) as { song_id?: string; artist_id?: string }[]) {
      const songId = typeof row.song_id === 'string' ? row.song_id : '';
      const artistId = typeof row.artist_id === 'string' ? row.artist_id : '';
      if (!songId || !artistId || !domesticSongIds.has(songId)) continue;
      songSets.get(artistId)?.add(songId);
    }
  }

  const out = new Map<string, number>();
  for (const [id, set] of songSets) out.set(id, set.size);
  return out;
}

export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const rawRows: ArtistRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select(
        'id, name, name_ja, name_sort, image_url, spotify_artist_images, updated_at, ' +
          'description_en, profile_text, ai_profile_generated_at, ai_profile_source, ' +
          'origin_country, active_period, birth_date, death_date, occupations, kind, ' +
          'spotify_artist_id, youtube_channel_id, wikipedia_page',
      )
      .eq('catalog_scope', 'domestic')
      .order('name_sort', { ascending: true, nullsFirst: false })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[admin/domestic-artist-profile/list]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    rawRows.push(...(data as ArtistRow[]));
    if (data.length < PAGE) break;
  }

  const prelim = rawRows
    .map((row) => {
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!id || !name) return null;
      return { row, id, name };
    })
    .filter((x): x is { row: ArtistRow; id: string; name: string } => x != null);

  const songCounts = await countDomesticSongsByArtists(
    admin,
    prelim.map((x) => ({ id: x.id, name: x.name })),
  );

  const rows = prelim
    .map(({ row, id }) => ({
      row,
      item: toListItem(row, songCounts.get(id) ?? 0),
    }))
    .filter((x): x is { row: ArtistRow; item: DomesticRegisteredArtistListItem } => x.item != null)
    .sort((a, b) => {
      const cmp = sortKey(a.row).localeCompare(sortKey(b.row), 'en', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
      return a.item.name.localeCompare(b.item.name, 'en', { sensitivity: 'base' });
    })
    .map((x) => x.item);

  return NextResponse.json({ ok: true, rows, total: rows.length });
}
