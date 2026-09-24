import type { SupabaseClient } from '@supabase/supabase-js';
import { replaceArtistMemberGraph, validateArtistMemberGraph } from '@/lib/artist-members';
import { artistNameToMusic8Slug, normalizeYoutubeChannelRef, resolveYoutubeChannelHref } from '@/lib/music8-artist-display';
import { normalizeWikipediaArticleHref } from '@/lib/library-artist-public-display';
import {
  buildNameSort,
  type Music8ArtistDbPatch,
  resolveExistingArtistIdForMusic8Patch,
  upsertArtistDbPatch,
} from '@/lib/music8-artist-import';
import {
  type AdminArtistProfileDraft,
  normalizeAdminArtistActivePeriod,
  withSyncedAdminArtistDisplayName,
} from '@/lib/admin-artist-profile-parse';

export type SaveAdminArtistProfileResult =
  | { ok: true; artistId: string; mode: 'insert' | 'update' }
  | { ok: false; error: string };

function buildArtistSlug(name: string): string | null {
  const slug = artistNameToMusic8Slug(name);
  if (slug) return slug;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || null;
}

export function buildArtistDbPatchFromAdminDraft(
  draft: AdminArtistProfileDraft,
  opts?: { aiModel?: string | null; artistId?: string | null },
): Music8ArtistDbPatch {
  const synced = withSyncedAdminArtistDisplayName(draft);
  const name = synced.name.trim();
  const nameBase = synced.nameBase.trim() || name;
  const thePrefix = synced.thePrefix;
  const occupationLabel =
    synced.occupations.length > 0 ? synced.occupations.join(', ') : null;
  const ytRaw = synced.youtubeChannelId?.trim() || null;
  const ytRef = normalizeYoutubeChannelRef(ytRaw) ?? ytRaw;
  const ytUrl = resolveYoutubeChannelHref(ytRef);

  const patch: Music8ArtistDbPatch = {
    name,
    name_base: nameBase,
    the_prefix: thePrefix,
    name_sort: buildNameSort(name),
    name_ja: synced.nameJa,
    name_en: synced.nameEn,
    origin_country: synced.originCountry,
    active_period: normalizeAdminArtistActivePeriod(synced.activePeriod),
    birth_date: synced.birthDate,
    death_date: synced.deathDate,
    occupations: synced.occupations.length > 0 ? synced.occupations : null,
    kind: occupationLabel,
    description_en: synced.descriptionEn,
    profile_text: synced.profileText,
    catalog_scope: synced.catalogScope,
    spotify_artist_id: synced.spotifyArtistId,
    spotify_artist_images: synced.spotifyArtistImages,
    spotify_artist_popularity: synced.spotifyArtistPopularity,
    image_url: synced.spotifyArtistImages,
    youtube_channel_id: ytRef,
    youtube_channel_url: ytUrl,
    youtube_channel_title:
      synced.youtubeChannelTitle?.trim() || (ytUrl ? `${name} YouTube Channel` : null),
    wikipedia_page: synced.wikipediaPage,
    wikipedia_url: normalizeWikipediaArticleHref(synced.wikipediaUrl),
    music8_artist_slug: buildArtistSlug(name),
    ai_profile_generated_at: new Date().toISOString(),
    ai_profile_model: opts?.aiModel?.trim() || null,
    ai_profile_source: 'gemini_admin_artist_category',
    updated_at: new Date().toISOString(),
  };

  return patch;
}

export async function saveAdminArtistProfile(params: {
  admin: SupabaseClient;
  draft: AdminArtistProfileDraft;
  artistId?: string | null;
  aiModel?: string | null;
  dryRun?: boolean;
  memberGraph?: { memberIds: string[]; bandIds: string[] } | null;
}): Promise<SaveAdminArtistProfileResult> {
  const name = params.draft.name.trim() || params.draft.nameBase.trim();
  if (!name) {
    return { ok: false, error: 'アーティスト名が空です。' };
  }

  let memberGraph = params.memberGraph ?? null;
  if (memberGraph) {
    const checked = await validateArtistMemberGraph(params.admin, params.artistId, memberGraph);
    if (!checked.ok) return { ok: false, error: checked.error };
    memberGraph = { memberIds: checked.memberIds, bandIds: checked.bandIds };
  }

  const patch = buildArtistDbPatchFromAdminDraft(params.draft, {
    aiModel: params.aiModel,
    artistId: params.artistId,
  });

  let existingId = params.artistId?.trim() || null;
  if (!existingId) {
    try {
      existingId = await resolveExistingArtistIdForMusic8Patch(params.admin, patch);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const result = await upsertArtistDbPatch(
    params.admin,
    patch,
    existingId,
    params.dryRun === true,
  );

  if (result.error || !result.id) {
    return { ok: false, error: result.error ?? 'artists の保存に失敗しました。' };
  }

  if (!params.dryRun && memberGraph) {
    try {
      await replaceArtistMemberGraph(params.admin, result.id, memberGraph);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : '所属関係の保存に失敗しました。',
      };
    }
  }

  return {
    ok: true,
    artistId: result.id,
    mode: result.mode === 'insert' ? 'insert' : 'update',
  };
}
