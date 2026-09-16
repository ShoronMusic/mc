/**
 * アーティスト詳細の Style Breakdown / Top Genres。
 * Music8 と同趣旨: スタイルは曲あたり1つ（合計100%）、ジャンルは複数タグ（合計は100%を超えうる）。
 */

import { parseMusicLibraryGenresColumn } from '@/lib/music-library-labels';
import {
  emptyMusicLibraryArtistCharts,
  type MusicLibraryArtistCharts,
  type MusicLibraryChartSlice,
} from '@/lib/music-library-types';
import { musicLibraryStyleHref } from '@/lib/music-library-urls';
import {
  MUSIC8_NAV_STYLE_COLORS,
  MUSIC8_NAV_STYLE_LABELS,
  MUSIC8_NAV_STYLE_SLUGS,
  music8NavStyleSlugFromName,
  type Music8NavStyleSlug,
} from '@/lib/music8-catalog-slugs';
import {
  extractMusic8SongFieldsFromPersistedSnapshot,
  filterMusic8GenreLabels,
} from '@/lib/music8-song-fields';

export const MUSIC_LIBRARY_TOP_GENRES_LIMIT = 5;

const GENRE_PALETTE = [
  '#b7d44a',
  '#d45aa8',
  '#e06a62',
  '#c85ad8',
  '#d4b03c',
  '#4ec4d4',
  '#e08a3c',
  '#6b8cff',
  '#6ece9a',
  '#e6a0c4',
  '#8b6bff',
  '#f0a050',
] as const;

export type MusicLibraryChartSongInput = {
  style?: string | null;
  genres?: unknown;
  music8_song_data?: unknown;
};

export function musicLibraryGenreBarColor(name: string): string {
  const t = name.trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < t.length; i += 1) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return GENRE_PALETTE[Math.abs(h) % GENRE_PALETTE.length]!;
}

export function musicLibraryChartTextIsDark(hex: string): boolean {
  const n = hex.replace('#', '');
  if (n.length < 6) return false;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  if (![r, g, b].every((v) => Number.isFinite(v))) return false;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function songGenres(row: MusicLibraryChartSongInput): string[] {
  const snap = extractMusic8SongFieldsFromPersistedSnapshot(row.music8_song_data);
  return filterMusic8GenreLabels([
    ...parseMusicLibraryGenresColumn(row.genres),
    ...(snap?.genres ?? []),
  ]);
}

function songStyleSlug(row: MusicLibraryChartSongInput): Music8NavStyleSlug | null {
  const fromCol = music8NavStyleSlugFromName(row.style ?? '');
  if (fromCol) return fromCol;
  if ((row.style ?? '').trim()) return 'others';
  return null;
}

export function songNavStyleSlugFromColumn(style: string | null | undefined): Music8NavStyleSlug | null {
  return songStyleSlug({ style });
}

/** 曲数がいちばん多いナビスタイル。同数なら slug 順。 */
export function pickDominantNavStyleSlug(
  tallies: Iterable<readonly [Music8NavStyleSlug, number]>,
): Music8NavStyleSlug | null {
  let best: Music8NavStyleSlug | null = null;
  let bestCount = 0;
  for (const [slug, n] of tallies) {
    if (n <= 0) continue;
    if (n > bestCount || (n === bestCount && best != null && slug.localeCompare(best) < 0)) {
      best = slug;
      bestCount = n;
    }
  }
  return best;
}

/** 整数%に丸め、合計を 100 に合わせる（最大剰余法）。 */
export function roundPercentsTo100(counts: readonly number[], total: number): number[] {
  if (total <= 0 || counts.length === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const rounded = raw.map((v) => Math.round(v));
  let diff = 100 - rounded.reduce((a, b) => a + b, 0);
  if (diff === 0) return rounded;
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));
  let guard = 0;
  while (diff !== 0 && guard < 1000) {
    const idx = order[guard % order.length]!.i;
    if (diff > 0) {
      rounded[idx]! += 1;
      diff -= 1;
    } else if (rounded[idx]! > 0) {
      rounded[idx]! -= 1;
      diff += 1;
    }
    guard += 1;
  }
  return rounded;
}

export function buildMusicLibraryArtistCharts(
  songs: readonly MusicLibraryChartSongInput[],
): MusicLibraryArtistCharts {
  const songCount = songs.length;
  if (songCount === 0) return emptyMusicLibraryArtistCharts();

  const styleCounts = new Map<Music8NavStyleSlug, number>();
  for (const slug of MUSIC8_NAV_STYLE_SLUGS) styleCounts.set(slug, 0);
  let styledCount = 0;
  const genreCounts = new Map<string, { label: string; count: number }>();

  for (const row of songs) {
    const style = songStyleSlug(row);
    if (style) {
      styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
      styledCount += 1;
    }
    for (const name of songGenres(row)) {
      const key = name.toLowerCase();
      const cur = genreCounts.get(key);
      if (cur) cur.count += 1;
      else genreCounts.set(key, { label: name, count: 1 });
    }
  }

  const styleEntries = MUSIC8_NAV_STYLE_SLUGS.map((slug) => ({
    slug,
    count: styleCounts.get(slug) ?? 0,
  })).filter((e) => e.count > 0);
  styleEntries.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
  const stylePercents = roundPercentsTo100(
    styleEntries.map((e) => e.count),
    styledCount,
  );
  const styles: MusicLibraryChartSlice[] = styleEntries.map((e, i) => ({
    key: e.slug,
    label: MUSIC8_NAV_STYLE_LABELS[e.slug],
    count: e.count,
    percent: stylePercents[i] ?? 0,
    color: MUSIC8_NAV_STYLE_COLORS[e.slug],
    href: musicLibraryStyleHref(e.slug),
  }));

  const genreEntries = [...genreCounts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  );
  const genres: MusicLibraryChartSlice[] = genreEntries
    .slice(0, MUSIC_LIBRARY_TOP_GENRES_LIMIT)
    .map((e) => ({
      key: e.label.toLowerCase(),
      label: e.label,
      count: e.count,
      percent: Math.round((e.count / songCount) * 100) || (e.count > 0 ? 1 : 0),
      color: musicLibraryGenreBarColor(e.label),
      href: null,
    }));

  return { songCount, styles, genres };
}
