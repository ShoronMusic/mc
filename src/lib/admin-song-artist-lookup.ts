/**
 * 曲詳細: クレジットに無いアーティスト名を artists から名前解決／確保する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdminSongArtistLink,
  adminSongArtistNamesMatch,
} from '@/lib/admin-song-artist-links';
import { ensureArtistForSongRegistration } from '@/lib/artist-selection-register';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-registered-pending';
import { libraryArtistNameLookupVariants } from '@/lib/library-search-query';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';

type ArtistNameRow = {
  id?: string;
  name?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
  name_en?: string | null;
  spotify_artist_id?: string | null;
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  name_ja?: string | null;
  origin_country?: string | null;
  youtube_channel_id?: string | null;
  wikipedia_page?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
};

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function rowToLink(row: ArtistNameRow): AdminSongArtistLink | null {
  const id = (row.id ?? '').trim();
  const name =
    displayNameFromArtistRow(row)?.trim() ||
    row.name?.trim() ||
    '';
  if (!id || !name) return null;
  return {
    id,
    name,
    isNewArtist: isSelectionRegisteredArtistPendingWp(row),
    spotifyArtistId: row.spotify_artist_id?.trim() || null,
  };
}

function withIdSelect(artistSelect: string): string {
  return artistSelect.includes('id') ? artistSelect : `id, ${artistSelect}`;
}

async function fetchArtistLinkById(
  admin: SupabaseClient,
  artistId: string,
  selectCols: string,
): Promise<AdminSongArtistLink | null> {
  const { data, error } = await admin.from('artists').select(selectCols).eq('id', artistId).maybeSingle();
  if (error || !data) return null;
  return rowToLink(data as ArtistNameRow);
}

export async function lookupAdminSongArtistLinksByNames(
  admin: SupabaseClient,
  names: string[],
  artistSelect: string,
  opts?: { spotifyArtistIdByName?: Record<string, string> },
): Promise<AdminSongArtistLink[]> {
  const out: AdminSongArtistLink[] = [];
  const seen = new Set<string>();
  const selectCols = withIdSelect(artistSelect);
  const spotifyByName = opts?.spotifyArtistIdByName ?? {};

  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    let found: AdminSongArtistLink | null = null;

    const spotifyId = Object.entries(spotifyByName).find(([n]) => adminSongArtistNamesMatch(n, name))?.[1]?.trim();
    if (spotifyId) {
      const { data } = await admin
        .from('artists')
        .select(selectCols)
        .eq('spotify_artist_id', spotifyId)
        .maybeSingle();
      if (data) found = rowToLink(data as ArtistNameRow);
    }

    const slug = artistNameToMusic8Slug(name);
    if (!found && slug) {
      const { data } = await admin
        .from('artists')
        .select(selectCols)
        .eq('music8_artist_slug', slug)
        .limit(1)
        .maybeSingle();
      if (data) found = rowToLink(data as ArtistNameRow);
    }

    if (!found) {
      const variants = libraryArtistNameLookupVariants(name);
      for (const variant of variants) {
        const { data, error } = await admin
          .from('artists')
          .select(selectCols)
          .ilike('name', escapeIlikeExact(variant))
          .limit(5);
        if (error) break;
        const rows = (data ?? []) as ArtistNameRow[];
        const exact =
          rows.find((r) => adminSongArtistNamesMatch(r.name ?? '', name)) ??
          rows.find((r) => adminSongArtistNamesMatch(r.name_en ?? '', name)) ??
          rows.find((r) =>
            adminSongArtistNamesMatch(displayNameFromArtistRow(r) ?? '', name),
          ) ??
          rows[0];
        if (exact) {
          found = rowToLink(exact);
          if (found) break;
        }
      }
    }

    if (!found) {
      const stripped = name.replace(/^(the|a|an)\s+/i, '').trim();
      if (stripped) {
        const { data } = await admin
          .from('artists')
          .select(selectCols)
          .ilike('name_base', escapeIlikeExact(stripped))
          .limit(5);
        const rows = (data ?? []) as ArtistNameRow[];
        const hit =
          rows.find((r) => adminSongArtistNamesMatch(displayNameFromArtistRow(r) ?? '', name)) ??
          rows[0];
        if (hit) found = rowToLink(hit);
      }
    }

    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      out.push(found);
    }
  }

  return out;
}

/** 名前で見つからないときは artists 行を確保して編集リンクを出せるようにする */
export async function ensureAdminSongArtistLinksByNames(
  admin: SupabaseClient,
  names: string[],
  artistSelect: string,
  opts?: { spotifyArtistIdByName?: Record<string, string> },
): Promise<AdminSongArtistLink[]> {
  const out = await lookupAdminSongArtistLinksByNames(admin, names, artistSelect, opts);
  const selectCols = withIdSelect(artistSelect);

  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    if (out.some((l) => adminSongArtistNamesMatch(l.name, name))) continue;

    const ensured = await ensureArtistForSongRegistration(admin, name);
    if (!ensured?.artistId) continue;

    const link =
      (await fetchArtistLinkById(admin, ensured.artistId, selectCols)) ??
      ({
        id: ensured.artistId,
        name: ensured.displayName || name,
        isNewArtist: true,
        spotifyArtistId: opts?.spotifyArtistIdByName
          ? Object.entries(opts.spotifyArtistIdByName).find(([n]) => adminSongArtistNamesMatch(n, name))?.[1] ??
            null
          : null,
      } satisfies AdminSongArtistLink);

    const spotifyId = Object.entries(opts?.spotifyArtistIdByName ?? {}).find(([n]) =>
      adminSongArtistNamesMatch(n, name),
    )?.[1]?.trim();
    if (spotifyId && !link.spotifyArtistId) {
      const { error } = await admin
        .from('artists')
        .update({ spotify_artist_id: spotifyId })
        .eq('id', link.id);
      if (!error) link.spotifyArtistId = spotifyId;
    }

    if (!out.some((l) => l.id === link.id)) out.push(link);
  }

  return out;
}
