/**
 * Music Library 一覧行の表示ラベル（クライアントでも import 可）。
 */

import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { filterMusic8GenreLabels } from '@/lib/music8-song-fields';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import type { MusicLibraryVocalLabel } from '@/lib/music-library-types';

/** 原盤日・YouTube 公開日を一覧右端の `2026.09` 形式にする。月が無ければ年のみ。 */
export function formatMusicLibraryYearMonth(iso: string | null | undefined): string | null {
  const t = (iso ?? '').trim();
  if (!t) return null;
  const slash = t.match(/^(\d{4})\/(\d{1,2})/);
  if (slash) return `${slash[1]}.${String(Number(slash[2])).padStart(2, '0')}`;
  const dotted = t.match(/^(\d{4})\.(\d{1,2})(?:\.\d{1,2})?/);
  if (dotted) return `${dotted[1]}.${String(Number(dotted[2])).padStart(2, '0')}`;
  const isoYm = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (isoYm) return `${isoYm[1]}.${isoYm[2]}`;
  const yearOnly = t.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];
  return null;
}

/** 一覧の年見出し用。年月表示から先頭4桁を取る。 */
export function musicLibraryReleaseYear(iso: string | null | undefined): string | null {
  const ym = formatMusicLibraryYearMonth(iso);
  if (!ym) return null;
  const y = ym.match(/^(\d{4})/);
  return y?.[1] ?? null;
}

export function groupMusicLibrarySongsByYear<T extends { releaseDate?: string | null }>(
  songs: readonly T[],
): { year: string | null; songs: T[] }[] {
  const groups: { year: string | null; songs: T[] }[] = [];
  for (const song of songs) {
    const year = musicLibraryReleaseYear(song.releaseDate);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.songs.push(song);
    else groups.push({ year, songs: [song] });
  }
  return groups;
}

const ORIGIN_SHORT: Record<string, string> = {
  UK: 'UK',
  GBR: 'UK',
  'UNITED KINGDOM': 'UK',
  'GREAT BRITAIN': 'UK',
  BRITAIN: 'UK',
  ENGLAND: 'UK',
  SCOTLAND: 'UK',
  WALES: 'UK',
  'NORTHERN IRELAND': 'UK',
  US: 'US',
  USA: 'US',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  JP: 'JP',
  JPN: 'JP',
  JAPAN: 'JP',
};

/** 日本語名横の年齢。`78歳` → `(78)`、`享年63歳` → `(享年63)`。 */
export function formatMusicLibraryAgeParen(ageLabel: string | null | undefined): string | null {
  const t = (ageLabel ?? '').trim();
  if (!t) return null;
  const died = t.match(/享年\s*(\d+)/);
  if (died) return `(享年${died[1]})`;
  const n = t.match(/(\d+)/);
  if (n) return `(${n[1]})`;
  return null;
}

/** 活動期。末尾の `-` 重複（`2001 - -`）を `2001 -` にまとめる。 */
export function formatMusicLibraryActivePeriod(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t || t === '-' || t === '—' || t === '－') return null;
  const collapsed = t
    .replace(/[-–—ー−]/g, '-')
    .replace(/(\s*-\s*)+$/g, ' -')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed || null;
}

/** `2013 -` / `1977 - 1986` の開始年。無ければ null。 */
export function musicLibraryActiveStartYear(raw: string | null | undefined): number | null {
  const t = formatMusicLibraryActivePeriod(raw) ?? (raw ?? '').trim();
  if (!t) return null;
  const m = t.match(/\b((?:18|19|20)\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/** 職種・種別。occupations があればそちら、無ければ kind。英語は単語頭を大文字に。 */
export function formatMusicLibraryOccupation(
  kind: string | null | undefined,
  occupations?: string[] | null,
): string | null {
  const occ = Array.isArray(occupations)
    ? occupations.map((s) => s.trim()).filter(Boolean)
    : [];
  const raw = occ.length > 0 ? occ.join(', ') : (kind ?? '').trim();
  if (!raw) return null;
  if (raw === raw.toLowerCase()) {
    return raw.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return raw;
}

/** アーティスト横の国籍ラベル。`UK` / `US` / `JP` など短いコード。 */
export function formatMusicLibraryOriginLabel(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  const first = t.split(/\s*\/\s*|\s*,\s*/)[0]?.trim() ?? '';
  const stripped = first.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  if (!stripped) return null;
  const upper = stripped.toUpperCase();
  if (ORIGIN_SHORT[upper]) return ORIGIN_SHORT[upper];
  if (/^[A-Z]{2,3}$/.test(upper)) return upper;
  if (stripped.length <= 12) return stripped;
  return null;
}

export function parseMusicLibraryGenresColumn(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
      .filter(Boolean);
  }
  if (typeof raw !== 'string') return [];
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) return parseMusicLibraryGenresColumn(parsed);
    } catch {
      /* カンマ区切りとして扱う */
    }
  }
  return t
    .split(/[,;|]/)
    .map((g) => g.trim())
    .filter(Boolean);
}

function uniqueGenreNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** タイトル横のボーカル。F と M が両方あるときは別ラベル。 */
export function musicLibraryVocalLabels(raw: string | null | undefined): MusicLibraryVocalLabel[] {
  const v = formatLibraryVocalDisplay(raw);
  if (v === 'F,M') return ['F', 'M'];
  if (v === 'F' || v === 'M') return [v];
  return [];
}

export function parseMusicLibrarySnapshotArtists(
  data: unknown,
): { name: string; slug: string | null }[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const o = data as Record<string, unknown>;
  const raw = Array.isArray(o.main_artists) ? o.main_artists : Array.isArray(o.artists) ? o.artists : [];
  const out: { name: string; slug: string | null }[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    let name = '';
    let slug: string | null = null;
    if (typeof a === 'string') {
      name = a.trim();
    } else if (a && typeof a === 'object' && !Array.isArray(a)) {
      const rec = a as Record<string, unknown>;
      name =
        (typeof rec.name === 'string' ? rec.name : typeof rec.title === 'string' ? rec.title : '').trim();
      const s = typeof rec.slug === 'string' ? rec.slug.trim().toLowerCase() : '';
      slug = s || null;
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, slug });
    if (out.length >= 8) break;
  }
  return out;
}

function nameAlreadyHasArticlePrefix(name: string, prefix: string): boolean {
  return name.toLowerCase().startsWith(`${prefix.toLowerCase()} `);
}

/**
 * DB の `the_prefix` を一覧・クレジット表示名へ。
 * `name` がすでに The 付きなら二重にしない。
 */
export function musicLibraryArtistNameFromRow(row: {
  name?: string | null;
  name_base?: string | null;
  the_prefix?: string | null;
}): string {
  const prefix = (row.the_prefix ?? '').trim();
  const base = (row.name_base ?? '').trim();
  const name = (row.name ?? '').trim();
  if (base && prefix) {
    return nameAlreadyHasArticlePrefix(base, prefix) ? base : `${prefix} ${base}`;
  }
  if (name) {
    if (prefix && !nameAlreadyHasArticlePrefix(name, prefix)) return `${prefix} ${name}`;
    return name;
  }
  return base;
}

/** slug と英語名が同じ人物か（All For Love vs bryan-adams は false）。 */
export function musicLibraryNameMatchesArtistSlug(name: string, slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase();
  const n = artistNameToMusic8Slug(name);
  if (!s || !n) return false;
  if (n === s) return true;
  if (n.startsWith('the-') && n.slice(4) === s) return true;
  if (s.startsWith('the-') && s.slice(4) === n) return true;
  return false;
}

export function musicLibraryDisplayNameFromSlug(slug: string): string {
  const raw = slug.trim().toLowerCase().replace(/^the-/, '');
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * `artists.name` に曲名が入っているとき（Billie Jean / All For Love）は slug か曲の main_artist を使う。
 */
export function resolveMusicLibraryArtistDisplayName(input: {
  name?: string | null;
  slug?: string | null;
  fallbacks?: readonly (string | null | undefined)[] | null;
}): string {
  const slug = (input.slug ?? '').trim().toLowerCase();
  const name = (input.name ?? '').trim();
  const fallbacks = (input.fallbacks ?? []).map((x) => (x ?? '').trim()).filter(Boolean);
  const candidates = [...new Set([name, ...fallbacks].filter(Boolean))];
  if (slug) {
    const matched = candidates.find((c) => musicLibraryNameMatchesArtistSlug(c, slug));
    if (matched) return matched;
    if (name && !musicLibraryNameMatchesArtistSlug(name, slug)) {
      return musicLibraryDisplayNameFromSlug(slug);
    }
  }
  return name || (slug ? musicLibraryDisplayNameFromSlug(slug) : '');
}

/** タイトル横のジャンル。複数は `Pop / R&B` のように `/` 区切り。 */
export function pickMusicLibraryGenreLabel(input: {
  columnGenres?: unknown;
  snapshotGenres?: readonly string[] | null;
}): string | null {
  const merged = uniqueGenreNames([
    ...(input.snapshotGenres ?? []),
    ...parseMusicLibraryGenresColumn(input.columnGenres),
  ]);
  const labels = filterMusic8GenreLabels(merged);
  if (labels.length === 0) return null;
  return labels.join(' / ');
}
