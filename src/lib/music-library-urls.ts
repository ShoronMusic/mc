/**
 * Music Library（`/music`）のパスとページネーション。
 * 仕様: docs/00-music-library-spec.md
 */

import {
  MUSIC8_NAV_STYLE_SLUGS,
  type Music8NavStyleSlug,
} from '@/lib/music8-catalog-slugs';

export const MUSIC_LIBRARY_BASE = '/music';
export const MUSIC_LIBRARY_PAGE_SIZE = 40;
export const MUSIC_LIBRARY_TOP_PER_STYLE = 3;

export const MUSIC_LIBRARY_RESERVED_SLUGS = [
  'styles',
  'artists',
  'genres',
  'search',
  'genre-best',
  'about',
  'playlists',
  'songs',
] as const;

export type MusicLibraryReservedSlug = (typeof MUSIC_LIBRARY_RESERVED_SLUGS)[number];

export function isMusicLibraryReservedSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  return (MUSIC_LIBRARY_RESERVED_SLUGS as readonly string[]).includes(s);
}

export function isMusicLibraryNavStyleSlug(slug: string): slug is Music8NavStyleSlug {
  return (MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(slug.trim().toLowerCase());
}

/** 1 始まり。不正なら null。 */
export function parseMusicLibraryPageParam(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null;
  if (n > 100_000) return null;
  return n;
}

export function musicLibraryTotalPages(totalItems: number, pageSize = MUSIC_LIBRARY_PAGE_SIZE): number {
  const total = Math.max(0, Math.floor(totalItems));
  const size = Math.max(1, Math.floor(pageSize));
  if (total === 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

export function clampMusicLibraryPage(page: number, totalItems: number, pageSize = MUSIC_LIBRARY_PAGE_SIZE): number {
  const parsed = parseMusicLibraryPageParam(page) ?? 1;
  const last = musicLibraryTotalPages(totalItems, pageSize);
  return Math.min(parsed, last);
}

export function sliceMusicLibraryPage<T>(
  items: readonly T[],
  page: number,
  pageSize = MUSIC_LIBRARY_PAGE_SIZE,
): { items: T[]; page: number; totalPages: number; totalItems: number } {
  const totalItems = items.length;
  const totalPages = musicLibraryTotalPages(totalItems, pageSize);
  const safePage = clampMusicLibraryPage(page, totalItems, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize) as T[],
    page: safePage,
    totalPages,
    totalItems,
  };
}

export function musicLibraryHomeHref(): string {
  return MUSIC_LIBRARY_BASE;
}

export function musicLibraryStylesHref(): string {
  return `${MUSIC_LIBRARY_BASE}/styles`;
}

export function musicLibraryStyleHref(styleSlug: string, page = 1): string {
  const slug = styleSlug.trim().toLowerCase();
  const p = parseMusicLibraryPageParam(page) ?? 1;
  return `${MUSIC_LIBRARY_BASE}/styles/${encodeURIComponent(slug)}/${p}`;
}

export function musicLibraryArtistsHref(): string {
  return `${MUSIC_LIBRARY_BASE}/artists`;
}

/** A–Z は小文字、記号・非ラテンは `other`。 */
export function musicLibraryArtistLetterParam(letter: string): string {
  const t = letter.trim();
  if (!t || t === '#' || /^other$/i.test(t)) return 'other';
  const first = t[0] ?? '';
  if (/[A-Za-z]/.test(first)) return first.toLowerCase();
  if (/[0-9]/.test(first)) return first;
  return 'other';
}

export function musicLibraryArtistLetterHref(letter: string): string {
  return `${MUSIC_LIBRARY_BASE}/artists/${encodeURIComponent(musicLibraryArtistLetterParam(letter))}`;
}

export function musicLibraryArtistHref(artistSlug: string, page = 1): string {
  const slug = artistSlug.trim().toLowerCase();
  const p = parseMusicLibraryPageParam(page) ?? 1;
  if (p <= 1) return `${MUSIC_LIBRARY_BASE}/${encodeURIComponent(slug)}`;
  return `${MUSIC_LIBRARY_BASE}/${encodeURIComponent(slug)}/${p}`;
}

export function musicLibrarySongHref(artistSlug: string, songSlug: string): string | null {
  const a = artistSlug.trim().toLowerCase();
  const s = songSlug.trim().toLowerCase();
  if (!a || !s || isMusicLibraryReservedSlug(a)) return null;
  return `${MUSIC_LIBRARY_BASE}/${encodeURIComponent(a)}/songs/${encodeURIComponent(s)}`;
}

export function withMusicLibraryAutoplay(href: string, index = 0): string {
  const trimmed = href.trim();
  if (!trimmed.startsWith('/')) return trimmed;
  const qIndex = trimmed.indexOf('?');
  const path = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  const qs = qIndex >= 0 ? trimmed.slice(qIndex + 1) : '';
  const hashIndex = qs.indexOf('#');
  const query = hashIndex >= 0 ? qs.slice(0, hashIndex) : qs;
  const hash = hashIndex >= 0 ? qs.slice(hashIndex) : '';
  const params = new URLSearchParams(query);
  params.set('autoplay', '1');
  const i = Math.max(0, Math.floor(index));
  if (i > 0) params.set('i', String(i));
  else params.delete('i');
  const next = params.toString();
  return next ? `${path}?${next}${hash}` : `${path}${hash}`;
}

export function parseMusicLibraryAutoplayIndex(
  searchParams: { autoplay?: string | string[]; i?: string | string[] } | undefined,
): { autoplay: boolean; index: number } {
  const autoRaw = Array.isArray(searchParams?.autoplay)
    ? searchParams?.autoplay[0]
    : searchParams?.autoplay;
  const iRaw = Array.isArray(searchParams?.i) ? searchParams?.i[0] : searchParams?.i;
  const autoplay = autoRaw === '1' || autoRaw === 'true';
  const n = Number.parseInt(String(iRaw ?? '0').trim(), 10);
  const index = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return { autoplay, index };
}

export function musicLibraryAdminSongEditHref(songId: string): string {
  return `/admin/songs/${encodeURIComponent(songId.trim())}`;
}

export function musicLibraryAdminArtistEditHref(opts: { name?: string | null; slug?: string | null }): string {
  const qs = new URLSearchParams();
  const slug = (opts.slug ?? '').trim();
  const name = (opts.name ?? '').trim();
  if (slug) qs.set('slug', slug);
  if (name) qs.set('name', name);
  return `/admin/library/artist?${qs.toString()}`;
}
