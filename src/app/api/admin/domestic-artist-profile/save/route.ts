import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { uniqueArtistIds } from '@/lib/artist-members';
import { saveAdminArtistProfile } from '@/lib/admin-artist-profile-save';
import type { AdminArtistProfileDraft } from '@/lib/admin-artist-profile-parse';
import {
  normalizeAdminArtistThePrefix,
  splitAdminArtistNameParts,
  withSyncedAdminArtistDisplayName,
} from '@/lib/admin-artist-profile-parse';

export const dynamic = 'force-dynamic';

type ReqBody = {
  draft?: unknown;
  artistId?: unknown;
  aiModel?: unknown;
  dryRun?: unknown;
  memberIds?: unknown;
  bandIds?: unknown;
};

function asNullableString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function parseDraft(raw: unknown): AdminArtistProfileDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const nameRaw = typeof o.name === 'string' ? o.name.trim() : '';
  const nameBaseRaw = typeof o.nameBase === 'string' ? o.nameBase.trim() : '';
  if (!nameRaw && !nameBaseRaw) return null;

  const catalogRaw = typeof o.catalogScope === 'string' ? o.catalogScope.trim().toLowerCase() : 'domestic';
  const catalogScope =
    catalogRaw === 'western' ? 'western' : catalogRaw === 'unknown' ? 'unknown' : 'domestic';

  const occupations = Array.isArray(o.occupations)
    ? o.occupations
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  const hasNameBase = typeof o.nameBase === 'string';
  const hasThePrefix = Object.prototype.hasOwnProperty.call(o, 'thePrefix');
  let nameBase: string;
  let thePrefix: ReturnType<typeof normalizeAdminArtistThePrefix>;
  if (hasNameBase || hasThePrefix) {
    const fromDisplay = splitAdminArtistNameParts(nameRaw || nameBaseRaw);
    nameBase = nameBaseRaw || fromDisplay.nameBase;
    thePrefix = hasThePrefix
      ? normalizeAdminArtistThePrefix(typeof o.thePrefix === 'string' ? o.thePrefix : null)
      : null;
  } else {
    const parts = splitAdminArtistNameParts(nameRaw);
    nameBase = parts.nameBase;
    thePrefix = parts.thePrefix;
  }

  return withSyncedAdminArtistDisplayName({
    name: nameRaw || nameBase,
    nameBase,
    thePrefix,
    nameEn: asNullableString(o.nameEn),
    nameJa: asNullableString(o.nameJa),
    originCountry: asNullableString(o.originCountry),
    activePeriod: asNullableString(o.activePeriod),
    birthDate: asNullableString(o.birthDate),
    deathDate: asNullableString(o.deathDate),
    occupations,
    descriptionEn: asNullableString(o.descriptionEn),
    profileText: asNullableString(o.profileText),
    catalogScope,
    spotifyArtistId: asNullableString(o.spotifyArtistId),
    spotifyArtistImages: asNullableString(o.spotifyArtistImages),
    spotifyArtistPopularity:
      typeof o.spotifyArtistPopularity === 'number' && Number.isFinite(o.spotifyArtistPopularity)
        ? Math.round(o.spotifyArtistPopularity)
        : null,
    youtubeChannelId: asNullableString(o.youtubeChannelId),
    youtubeChannelTitle: asNullableString(o.youtubeChannelTitle),
    wikipediaPage: asNullableString(o.wikipediaPage),
  });
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const draft = parseDraft(body.draft);
  if (!draft) {
    return NextResponse.json({ error: 'draft（name 必須）が不正です。' }, { status: 400 });
  }

  const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : null;
  const aiModel = typeof body.aiModel === 'string' ? body.aiModel.trim() : null;
  const dryRun = body.dryRun === true;
  const memberGraph =
    body.memberIds === undefined && body.bandIds === undefined
      ? null
      : {
          memberIds: uniqueArtistIds(Array.isArray(body.memberIds) ? body.memberIds.map(String) : []),
          bandIds: uniqueArtistIds(Array.isArray(body.bandIds) ? body.bandIds.map(String) : []),
        };

  const result = await saveAdminArtistProfile({
    admin,
    draft,
    artistId,
    aiModel,
    dryRun,
    memberGraph,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    artistId: result.artistId,
    mode: result.mode,
    dryRun,
  });
}
