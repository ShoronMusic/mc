/**
 * Music Library 一覧行の表示ラベル（クライアントでも import 可）。
 */

import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { filterMusic8GenreLabels } from '@/lib/music8-song-fields';
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
