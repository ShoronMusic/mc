import type { SupabaseClient } from '@supabase/supabase-js';
import { artistNameToMusic8Slug, resolveYoutubeChannelHref } from '@/lib/music8-artist-display';
import {
  buildNameSort,
  type Music8ArtistDbPatch,
  resolveExistingArtistIdForMusic8Patch,
  upsertArtistDbPatch,
} from '@/lib/music8-artist-import';
import type { AdminArtistProfileDraft } from '@/lib/admin-artist-profile-parse';

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
  const name = draft.name.trim();
  const occupationLabel =
    draft.occupations.length > 0 ? draft.occupations.join(', ') : null;
  const ytUrl = resolveYoutubeChannelHref(draft.youtubeChannelId);

  const patch: Music8ArtistDbPatch = {
    name,
    name_sort: buildNameSort(name),
    name_ja: draft.nameJa,
    name_en: draft.nameEn,
    origin_country: draft.originCountry,
    active_period: draft.activePeriod,
    birth_date: draft.birthDate,
    death_date: draft.deathDate,
    occupations: draft.occupations.length > 0 ? draft.occupations : null,
    kind: occupationLabel,
    description_en: draft.descriptionEn,
    profile_text: draft.profileText,
    catalog_scope: draft.catalogScope,
    spotify_artist_id: draft.spotifyArtistId,
    spotify_artist_images: draft.spotifyArtistImages,
    spotify_artist_popularity: draft.spotifyArtistPopularity,
    image_url: draft.spotifyArtistImages,
    youtube_channel_id: draft.youtubeChannelId,
    youtube_channel_url: ytUrl,
    youtube_channel_title:
      draft.youtubeChannelTitle?.trim() || (ytUrl ? `${name} YouTube Channel` : null),
    wikipedia_page: draft.wikipediaPage,
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
}): Promise<SaveAdminArtistProfileResult> {
  const name = params.draft.name.trim();
  if (!name) {
    return { ok: false, error: 'アーティスト名が空です。' };
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

  return {
    ok: true,
    artistId: result.id,
    mode: result.mode === 'insert' ? 'insert' : 'update',
  };
}
