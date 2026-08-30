/**
 * Supabase 曲行 → Music8 公開用 JSON（musicaichat/v1 1 曲 + 索引エントリ）。
 * ディスク書き込みは scripts/export-music8-json-from-supabase.ts が行う。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { asRecord, MUSIC8_NAV_STYLE_SLUGS } from '@/lib/music8-catalog-slugs';

export const MUSIC8_JSON_SCHEMA_VERSION = '1.0.0';

export type MusicaichatStableKey = {
  artist_slug: string;
  song_slug: string;
};

export type MusicaichatSongJson = {
  schema_version: string;
  stable_key: MusicaichatStableKey;
  display: {
    song_title: string;
    primary_artist_name: string;
    credit_line: string;
    primary_artist_name_ja?: string;
  };
  recording: { kind: string };
  releases: {
    original_release_date: string | null;
  };
  classification: string[];
  youtube: { ids: string[]; primary_id: string | null };
  identifiers: { spotify_track_id?: string; music8_song_id?: number };
  facts_for_ai: {
    locale: string;
    opening_lines: string[];
    bullets: string[];
  };
};

export type YoutubeIndexEntry = {
  artist_slug: string;
  song_slug: string;
  role: 'primary' | 'alternate';
};

export function songJsonFileName(key: MusicaichatStableKey): string {
  return `${key.artist_slug}_${key.song_slug}.json`;
}

export function slugFromDisplayTitle(mainArtist: string, songTitle: string, fallback: string): string {
  const raw = (songTitle || fallback).trim().toLowerCase();
  const slug = raw
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'song';
}

export function artistSlugFromName(name: string, fallback: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

type SongExportRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  original_release_date: string | null;
  genres: string[] | null;
  vocal: string | null;
  style: string | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
  music8_song_id: number | null;
  music8_video_id: string | null;
  spotify_track_id: string | null;
  spotify_artists: string | null;
  primary_artist_name_ja: string | null;
  catalog_published_at?: string | null;
  created_at?: string | null;
};

function classificationFromRow(
  row: SongExportRow,
  styleSlugs: string[],
  genreNames: string[],
): string[] {
  const out: string[] = [];
  for (const s of styleSlugs) {
    if (s && !out.includes(s)) out.push(s);
  }
  if (row.style && !out.includes(row.style)) out.push(row.style);
  for (const g of genreNames) {
    if (g && !out.includes(g)) out.push(g);
  }
  if (Array.isArray(row.genres)) {
    for (const g of row.genres) {
      if (g && !out.includes(g)) out.push(g);
    }
  }
  if (row.vocal && !out.includes(row.vocal)) out.push(row.vocal);
  return out.slice(0, 16);
}

export function buildMusicaichatSongJson(params: {
  row: SongExportRow;
  videoIds: string[];
  styleSlugs: string[];
  genreNames: string[];
}): MusicaichatSongJson {
  const { row, videoIds, styleSlugs, genreNames } = params;
  const artistSlug =
    (row.music8_artist_slug ?? '').trim() || artistSlugFromName(row.main_artist ?? '', 'artist');
  const songSlug =
    (row.music8_song_slug ?? '').trim() ||
    slugFromDisplayTitle(row.main_artist ?? '', row.song_title ?? '', row.id);
  const primaryArtist = (row.main_artist ?? '').trim();
  const songTitle = (row.song_title ?? '').trim();
  const credit =
    (row.spotify_artists ?? '').trim() ||
    (row.display_title ?? '').trim() ||
    `${primaryArtist} - ${songTitle}`.trim();
  const uniqueVideos = [...new Set(videoIds.filter(Boolean))];
  if (row.music8_video_id && !uniqueVideos.includes(row.music8_video_id)) {
    uniqueVideos.unshift(row.music8_video_id);
  }
  const classification = classificationFromRow(row, styleSlugs, genreNames);
  const bullets = classification.map((c) => c);
  const opening = credit
    ? [`${credit}。`]
    : [`${primaryArtist} の楽曲。`];

  return {
    schema_version: MUSIC8_JSON_SCHEMA_VERSION,
    stable_key: { artist_slug: artistSlug, song_slug: songSlug },
    display: {
      song_title: songTitle,
      primary_artist_name: primaryArtist,
      credit_line: credit,
      ...(row.primary_artist_name_ja
        ? { primary_artist_name_ja: row.primary_artist_name_ja.trim() }
        : {}),
    },
    recording: { kind: 'original' },
    releases: {
      original_release_date: row.original_release_date ?? null,
    },
    classification,
    youtube: {
      ids: uniqueVideos,
      primary_id: uniqueVideos[0] ?? null,
    },
    identifiers: {
      ...(row.spotify_track_id ? { spotify_track_id: row.spotify_track_id } : {}),
      ...(row.music8_song_id != null ? { music8_song_id: row.music8_song_id } : {}),
    },
    facts_for_ai: {
      locale: 'ja',
      opening_lines: opening,
      bullets,
    },
  };
}

export function youtubeIndexEntriesForSong(
  json: MusicaichatSongJson,
): Record<string, YoutubeIndexEntry> {
  const out: Record<string, YoutubeIndexEntry> = {};
  const { artist_slug, song_slug } = json.stable_key;
  json.youtube.ids.forEach((id, i) => {
    out[id] = {
      artist_slug,
      song_slug,
      role: i === 0 ? 'primary' : 'alternate',
    };
  });
  return out;
}

export function mergeYoutubeIndex(
  current: Record<string, YoutubeIndexEntry>,
  next: Record<string, YoutubeIndexEntry>,
): Record<string, YoutubeIndexEntry> {
  return { ...current, ...next };
}

export type StylesSummaryItem = {
  slug: string;
  name: string;
  count: number;
};

export function emptyStylesSummary(): StylesSummaryItem[] {
  const names: Record<string, string> = {
    pop: 'Pop',
    dance: 'Dance',
    alternative: 'Alternative',
    electronica: 'Electronica',
    rb: 'R&B',
    'hip-hop': 'Hip-hop',
    rock: 'Rock',
    metal: 'Metal',
    others: 'Others',
  };
  return MUSIC8_NAV_STYLE_SLUGS.map((slug) => ({
    slug,
    name: names[slug],
    count: 0,
  }));
}

export type StyleMonthlyCell = {
  style: string;
  months: number[];
  total: number;
};

export function buildStyleMonthly(
  rows: Array<{ styleSlug: string; year: number; month: number }>,
  year: number,
): { year: number; styles: StyleMonthlyCell[]; total: number } {
  const byStyle = new Map<string, number[]>();
  for (const slug of MUSIC8_NAV_STYLE_SLUGS) {
    byStyle.set(slug, Array.from({ length: 12 }, () => 0));
  }
  for (const r of rows) {
    if (r.year !== year) continue;
    const arr = byStyle.get(r.styleSlug);
    if (!arr) continue;
    const i = r.month - 1;
    if (i < 0 || i > 11) continue;
    arr[i] += 1;
  }
  const styles: StyleMonthlyCell[] = MUSIC8_NAV_STYLE_SLUGS.map((slug) => {
    const months = byStyle.get(slug) ?? Array.from({ length: 12 }, () => 0);
    return { style: slug, months, total: months.reduce((a, b) => a + b, 0) };
  });
  const total = styles.reduce((a, s) => a + s.total, 0);
  return { year, styles, total };
}

const SONG_SELECT =
  'id, main_artist, song_title, display_title, original_release_date, genres, vocal, style, music8_artist_slug, music8_song_slug, music8_song_id, music8_video_id, spotify_track_id, spotify_artists, primary_artist_name_ja, catalog_published_at, created_at';

export async function loadSongExportBundle(
  admin: SupabaseClient,
  songId: string,
): Promise<{
  json: MusicaichatSongJson;
  youtubeIndex: Record<string, YoutubeIndexEntry>;
  fileName: string;
} | null> {
  const { data: row, error } = await admin.from('songs').select(SONG_SELECT).eq('id', songId).maybeSingle();
  if (error || !row) return null;
  const song = row as SongExportRow;

  const { data: videos } = await admin.from('song_videos').select('video_id').eq('song_id', songId);
  const videoIds = ((videos ?? []) as { video_id?: string }[])
    .map((v) => v.video_id)
    .filter((id): id is string => Boolean(id));

  let styleSlugs: string[] = [];
  const stylesJoin = await admin
    .from('song_styles')
    .select('catalog_styles(slug)')
    .eq('song_id', songId);
  if (!stylesJoin.error && stylesJoin.data) {
    for (const r of stylesJoin.data as unknown[]) {
      const o = asRecord(r);
      const nested = o ? asRecord(o.catalog_styles) : null;
      const slug = nested && typeof nested.slug === 'string' ? nested.slug : '';
      if (slug) styleSlugs.push(slug);
    }
  }

  let genreNames: string[] = [];
  const genresJoin = await admin
    .from('song_genres')
    .select('catalog_genres(name)')
    .eq('song_id', songId);
  if (!genresJoin.error && genresJoin.data) {
    for (const r of genresJoin.data as unknown[]) {
      const o = asRecord(r);
      const nested = o ? asRecord(o.catalog_genres) : null;
      const name = nested && typeof nested.name === 'string' ? nested.name : '';
      if (name) genreNames.push(name);
    }
  }

  const json = buildMusicaichatSongJson({ row: song, videoIds, styleSlugs, genreNames });
  return {
    json,
    youtubeIndex: youtubeIndexEntriesForSong(json),
    fileName: songJsonFileName(json.stable_key),
  };
}
