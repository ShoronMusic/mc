'use client';

import type { ReactNode } from 'react';
import type { AdminArtistProfileDraft } from '@/lib/admin-artist-profile-parse';

export type RegisteredArtistRow = {
  id: string;
  name: string;
  nameJa: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
  songCount?: number;
  status: {
    stage: 1 | 2 | 3 | 4 | 5;
    hasBasicInfo: boolean;
    hasSpotify: boolean;
    hasYoutube: boolean;
    hasWikipedia: boolean;
  };
};

export function RegistrationStatusIcons({
  status,
}: {
  status: RegisteredArtistRow['status'];
}) {
  const items = [
    { key: 'basic', label: '② 基本情報', done: status.hasBasicInfo, glyph: '基' },
    { key: 'spotify', label: '③ Spotify', done: status.hasSpotify, glyph: 'Sp' },
    { key: 'youtube', label: '④ YouTube', done: status.hasYoutube, glyph: 'YT' },
    { key: 'wiki', label: '⑤ Wikipedia', done: status.hasWikipedia, glyph: 'W' },
  ] as const;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {items.map((item) => (
        <span
          key={item.key}
          title={`${item.label}${item.done ? '：済' : '：未'}`}
          className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1 text-[10px] font-semibold ${
            item.done
              ? item.key === 'spotify'
                ? 'bg-emerald-900/70 text-emerald-200 ring-1 ring-emerald-700/50'
                : item.key === 'youtube'
                  ? 'bg-red-950/70 text-red-200 ring-1 ring-red-800/50'
                  : item.key === 'wiki'
                    ? 'bg-sky-950/70 text-sky-200 ring-1 ring-sky-800/50'
                    : 'bg-amber-950/70 text-amber-200 ring-1 ring-amber-700/50'
              : 'bg-gray-950 text-gray-600 ring-1 ring-gray-800'
          }`}
        >
          {item.glyph}
        </span>
      ))}
    </span>
  );
}

export function emptyDraft(name: string): AdminArtistProfileDraft {
  return {
    name,
    nameJa: null,
    nameEn: null,
    originCountry: 'JPN',
    activePeriod: null,
    birthDate: null,
    deathDate: null,
    occupations: [],
    descriptionEn: null,
    profileText: null,
    catalogScope: 'domestic',
    spotifyArtistId: null,
    spotifyArtistImages: null,
    spotifyArtistPopularity: null,
    youtubeChannelId: null,
    youtubeChannelTitle: null,
    wikipediaPage: null,
  };
}

export function artistRowToDraft(
  row: Record<string, unknown>,
  fallbackName: string,
): AdminArtistProfileDraft {
  const occupations = Array.isArray(row.occupations)
    ? row.occupations.filter((x): x is string => typeof x === 'string')
    : typeof row.kind === 'string' && row.kind.trim()
      ? row.kind.split(/[,、/]/).map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : fallbackName,
    nameEn: typeof row.name_en === 'string' ? row.name_en : null,
    nameJa: typeof row.name_ja === 'string' ? row.name_ja : null,
    originCountry: typeof row.origin_country === 'string' ? row.origin_country : null,
    activePeriod: typeof row.active_period === 'string' ? row.active_period : null,
    birthDate: typeof row.birth_date === 'string' ? row.birth_date : null,
    deathDate: typeof row.death_date === 'string' ? row.death_date : null,
    occupations,
    descriptionEn: typeof row.description_en === 'string' ? row.description_en : null,
    profileText: typeof row.profile_text === 'string' ? row.profile_text : null,
    catalogScope:
      row.catalog_scope === 'western' ? 'western' : row.catalog_scope === 'unknown' ? 'unknown' : 'domestic',
    spotifyArtistId: typeof row.spotify_artist_id === 'string' ? row.spotify_artist_id : null,
    spotifyArtistImages:
      typeof row.spotify_artist_images === 'string'
        ? row.spotify_artist_images
        : typeof row.image_url === 'string'
          ? row.image_url
          : null,
    spotifyArtistPopularity:
      typeof row.spotify_artist_popularity === 'number' && Number.isFinite(row.spotify_artist_popularity)
        ? Math.round(row.spotify_artist_popularity)
        : null,
    youtubeChannelId: typeof row.youtube_channel_id === 'string' ? row.youtube_channel_id : null,
    youtubeChannelTitle:
      typeof row.youtube_channel_title === 'string' ? row.youtube_channel_title : null,
    wikipediaPage: typeof row.wikipedia_page === 'string' ? row.wikipedia_page : null,
  };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-gray-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white';
