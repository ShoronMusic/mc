/**
 * 選曲時：YouTube 解決アーティストを artists に照合／m8 準拠で新規登録
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNameSort,
  displayNameFromArtistRow,
  lowerNameKeyForArtistUnique,
} from '@/lib/music8-artist-import';
import { splitArtistNameForM8Storage } from '@/lib/song-registration-normalize';
import { resolveArtistIdFromIndex, type ArtistLookupIndex } from '@/lib/song-credits-resolve';
import { loadArtistLookupIndex, clearArtistLookupIndexCache } from '@/lib/song-credits-sync';

export type EnsureArtistForRegistrationResult = {
  artistId: string;
  displayName: string;
  slug: string;
  nameBase: string;
  thePrefix: string | null;
  created: boolean;
};

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function findArtistIdBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('artists')
    .select('id')
    .eq('music8_artist_slug', slug)
    .limit(1)
    .maybeSingle();
  if (error?.code === '42703' || error?.code === '42P01') return null;
  if (error) throw error;
  if (!data) return null;
  return (data as { id?: string }).id?.trim() ?? null;
}

async function findArtistRowBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ id: string; displayName: string } | null> {
  const { data, error } = await supabase
    .from('artists')
    .select('id, name, name_base, the_prefix')
    .eq('music8_artist_slug', slug)
    .limit(1)
    .maybeSingle();
  if (error?.code === '42703' || error?.code === '42P01') return null;
  if (error) throw error;
  if (!data) return null;
  const id = (data as { id?: string }).id?.trim();
  if (!id) return null;
  const displayName = displayNameFromArtistRow(data as { name?: string; name_base?: string; the_prefix?: string }) ?? '';
  return { id, displayName: displayName || (data as { name?: string }).name?.trim() || '' };
}

/**
 * 既存 artists を slug / 索引で探し、無ければ name_base + the_prefix + slug で insert。
 */
export async function ensureArtistForSongRegistration(
  supabase: SupabaseClient,
  youtubeArtistString: string,
  index?: ArtistLookupIndex,
): Promise<EnsureArtistForRegistrationResult | null> {
  const split = splitArtistNameForM8Storage(youtubeArtistString);
  if (!split) return null;

  const idx = index ?? (await loadArtistLookupIndex(supabase));

  const bySlug = await findArtistRowBySlug(supabase, split.slug);
  if (bySlug) {
    return {
      artistId: bySlug.id,
      displayName: bySlug.displayName || split.displayName,
      slug: split.slug,
      nameBase: split.nameBase,
      thePrefix: split.thePrefix,
      created: false,
    };
  }

  const hitId = resolveArtistIdFromIndex(idx, split.displayName, null);
  if (hitId) {
    const { data } = await supabase
      .from('artists')
      .select('id, name, name_base, the_prefix')
      .eq('id', hitId)
      .maybeSingle();
    const displayName =
      displayNameFromArtistRow(data as { name?: string; name_base?: string; the_prefix?: string }) ??
      split.displayName;
    return {
      artistId: hitId,
      displayName,
      slug: split.slug,
      nameBase: split.nameBase,
      thePrefix: split.thePrefix,
      created: false,
    };
  }

  const displayName = split.creditNames.length > 1 ? split.creditNames.join(', ') : split.displayName;
  const payload: Record<string, unknown> = {
    name: displayName,
    name_base: split.nameBase,
    the_prefix: split.thePrefix,
    name_sort: buildNameSort(split.displayName),
    music8_artist_slug: split.slug,
  };

  const { data: inserted, error } = await supabase.from('artists').insert(payload).select('id').single();

  if (error?.code === '23505') {
    clearArtistLookupIndexCache();
    const raceId = await findArtistIdBySlug(supabase, split.slug);
    if (raceId) {
      const row = await findArtistRowBySlug(supabase, split.slug);
      return {
        artistId: raceId,
        displayName: row?.displayName ?? split.displayName,
        slug: split.slug,
        nameBase: split.nameBase,
        thePrefix: split.thePrefix,
        created: false,
      };
    }
    const ilikePattern = escapeIlikeExact(displayName);
    const { data: byName } = await supabase
      .from('artists')
      .select('id, name, name_base, the_prefix')
      .ilike('name', ilikePattern)
      .limit(1)
      .maybeSingle();
    const nid = (byName as { id?: string } | undefined)?.id?.trim();
    if (nid) {
      return {
        artistId: nid,
        displayName:
          displayNameFromArtistRow(byName as { name?: string; name_base?: string; the_prefix?: string }) ??
          displayName,
        slug: split.slug,
        nameBase: split.nameBase,
        thePrefix: split.thePrefix,
        created: false,
      };
    }
    return null;
  }

  if (error?.code === '42703' || error?.code === '42P01') {
    const fallbackPayload = {
      name: displayName,
      music8_artist_slug: split.slug,
    };
    const { data: ins2, error: err2 } = await supabase
      .from('artists')
      .insert(fallbackPayload)
      .select('id')
      .single();
    if (err2) {
      console.warn('[artist-selection-register] insert fallback', err2.message);
      return null;
    }
    const id = (ins2 as { id?: string }).id?.trim();
    if (!id) return null;
    clearArtistLookupIndexCache();
    return {
      artistId: id,
      displayName,
      slug: split.slug,
      nameBase: split.nameBase,
      thePrefix: split.thePrefix,
      created: true,
    };
  }

  if (error) {
    console.warn('[artist-selection-register] insert', error.message);
    return null;
  }

  const id = (inserted as { id?: string }).id?.trim();
  if (!id) return null;
  clearArtistLookupIndexCache();
  return {
    artistId: id,
    displayName,
    slug: split.slug,
    nameBase: split.nameBase,
    thePrefix: split.thePrefix,
    created: true,
  };
}

/** 管理画面：選曲由来で m8 未照会のアーティスト */
export function isSelectionRegisteredArtistPendingWp(row: {
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
}): boolean {
  const m8Id = row.music8_artist_id;
  if (typeof m8Id === 'number' && m8Id > 0) return false;
  if (row.music8_synced_at?.trim()) return false;
  return true;
}

export function artistRowSortKey(name: string): string {
  return lowerNameKeyForArtistUnique(name);
}
