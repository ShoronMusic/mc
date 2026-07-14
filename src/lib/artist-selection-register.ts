/**
 * 選曲時：YouTube 解決アーティストを artists に照合／m8 準拠で新規登録
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNameSort,
  displayNameFromArtistRow,
  lowerNameKeyForArtistUnique,
} from '@/lib/music8-artist-import';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { splitArtistNameForM8Storage } from '@/lib/song-registration-normalize';
import { resolveArtistIdFromIndex, type ArtistLookupIndex } from '@/lib/song-credits-resolve';
import { loadArtistLookupIndex, clearArtistLookupIndexCache } from '@/lib/song-credits-sync';
import { resolveDomesticArtistRegistrationStatus } from '@/lib/admin-domestic-artist-registration-status';

/** ローマ字 slug が無い邦楽アーティスト向けの決定的フォールバック */
function fallbackDomesticArtistSlug(displayName: string): string {
  let h = 0;
  for (let i = 0; i < displayName.length; i++) {
    h = (Math.imul(31, h) + displayName.charCodeAt(i)) >>> 0;
  }
  return `jp-${h.toString(36)}`;
}

async function patchArtistOriginCountryIfUnset(
  supabase: SupabaseClient,
  artistId: string,
  countryCode: string,
): Promise<void> {
  const code = countryCode.trim().toUpperCase();
  if (!code) return;

  const { data, error } = await supabase
    .from('artists')
    .select('origin_country')
    .eq('id', artistId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || error.code === '42P01') return;
    console.warn('[artist-selection-register] patchArtistOriginCountry select', error.message);
    return;
  }

  const cur = (data as { origin_country?: string | null } | null)?.origin_country;
  if (cur != null && String(cur).trim() !== '') return;

  const { error: uErr } = await supabase
    .from('artists')
    .update({ origin_country: code })
    .eq('id', artistId);
  if (uErr?.code === '42703' || uErr?.code === '42P01') return;
  if (uErr) {
    console.warn('[artist-selection-register] patchArtistOriginCountry update', uErr.message);
  }
}

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

/** 管理画面：選曲由来で「まだ整備が必要」なアーティストか */
export function isSelectionRegisteredArtistPendingWp(row: {
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  spotify_artist_id?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  ai_profile_generated_at?: string | null;
  name_ja?: string | null;
  name_en?: string | null;
  origin_country?: string | null;
  youtube_channel_id?: string | null;
  wikipedia_page?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
}): boolean {
  const m8Id = row.music8_artist_id;
  if (typeof m8Id === 'number' && m8Id > 0) return false;
  if (row.music8_synced_at?.trim()) return false;
  // Spotify / プロフィールが入っていれば邦楽登録等で整備済みとみなす
  if (row.spotify_artist_id?.trim()) return false;
  if ((row.profile_text ?? '').trim().length >= 40) return false;
  if ((row.description_en ?? '').trim().length >= 40) return false;
  if (row.ai_profile_generated_at?.trim()) return false;
  const domestic = resolveDomesticArtistRegistrationStatus(row);
  if (domestic.hasBasicInfo) return false;
  return true;
}

export function artistRowSortKey(name: string): string {
  return lowerNameKeyForArtistUnique(name);
}

/**
 * 邦楽ライト DB 向け: 日本語表示名 + チャンネル英字 slug ヒントで artists を確保。
 * `origin_country` が空なら `JP` を補完する。
 */
export async function ensureDomesticArtistForSongRegistration(
  supabase: SupabaseClient,
  artistDisplayName: string,
  opts?: { slugHint?: string | null; index?: ArtistLookupIndex },
): Promise<EnsureArtistForRegistrationResult | null> {
  const displayName = artistDisplayName.trim();
  if (!displayName) return null;

  const slugHint = (opts?.slugHint ?? '').trim();
  const slug = slugHint || artistNameToMusic8Slug(displayName) || fallbackDomesticArtistSlug(displayName);

  const bySlug = await findArtistRowBySlug(supabase, slug);
  if (bySlug) {
    await patchArtistOriginCountryIfUnset(supabase, bySlug.id, 'JP');
    return {
      artistId: bySlug.id,
      displayName: bySlug.displayName || displayName,
      slug,
      nameBase: displayName,
      thePrefix: null,
      created: false,
    };
  }

  const idx = opts?.index ?? (await loadArtistLookupIndex(supabase));
  const hitId = resolveArtistIdFromIndex(idx, displayName, null);
  if (hitId) {
    const { data } = await supabase
      .from('artists')
      .select('id, name, name_base, the_prefix')
      .eq('id', hitId)
      .maybeSingle();
    const resolvedDisplay =
      displayNameFromArtistRow(data as { name?: string; name_base?: string; the_prefix?: string }) ??
      displayName;
    await patchArtistOriginCountryIfUnset(supabase, hitId, 'JP');
    return {
      artistId: hitId,
      displayName: resolvedDisplay,
      slug,
      nameBase: displayName,
      thePrefix: null,
      created: false,
    };
  }

  const payload: Record<string, unknown> = {
    name: displayName,
    name_base: displayName,
    the_prefix: null,
    name_sort: buildNameSort(displayName),
    music8_artist_slug: slug,
    origin_country: 'JP',
  };

  const { data: inserted, error } = await supabase.from('artists').insert(payload).select('id').single();

  if (error?.code === '23505') {
    clearArtistLookupIndexCache();
    const raceId = await findArtistIdBySlug(supabase, slug);
    if (raceId) {
      await patchArtistOriginCountryIfUnset(supabase, raceId, 'JP');
      const row = await findArtistRowBySlug(supabase, slug);
      return {
        artistId: raceId,
        displayName: row?.displayName ?? displayName,
        slug,
        nameBase: displayName,
        thePrefix: null,
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
      await patchArtistOriginCountryIfUnset(supabase, nid, 'JP');
      return {
        artistId: nid,
        displayName:
          displayNameFromArtistRow(byName as { name?: string; name_base?: string; the_prefix?: string }) ??
          displayName,
        slug,
        nameBase: displayName,
        thePrefix: null,
        created: false,
      };
    }
    return null;
  }

  if (error?.code === '42703' || error?.code === '42P01') {
    const fallbackPayload = {
      name: displayName,
      music8_artist_slug: slug,
    };
    const { data: ins2, error: err2 } = await supabase
      .from('artists')
      .insert(fallbackPayload)
      .select('id')
      .single();
    if (err2) {
      console.warn('[artist-selection-register] ensureDomestic insert fallback', err2.message);
      return null;
    }
    const id = (ins2 as { id?: string }).id?.trim();
    if (!id) return null;
    clearArtistLookupIndexCache();
    await patchArtistOriginCountryIfUnset(supabase, id, 'JP');
    return {
      artistId: id,
      displayName,
      slug,
      nameBase: displayName,
      thePrefix: null,
      created: true,
    };
  }

  if (error) {
    console.warn('[artist-selection-register] ensureDomestic insert', error.message);
    return null;
  }

  const id = (inserted as { id?: string }).id?.trim();
  if (!id) return null;
  clearArtistLookupIndexCache();
  return {
    artistId: id,
    displayName,
    slug,
    nameBase: displayName,
    thePrefix: null,
    created: true,
  };
}
