/**
 * ジャンルマスタ（`catalog_genres`）の正規化・バリデーション。
 * 公開ライブラリは `/music/genres`。Genre BEST（プレイリスト）とは別。
 */

import { normalizeCatalogGenreName } from '@/lib/admin-song-artist-defaults';
import { slugifyCatalogLabel } from '@/lib/music8-catalog-slugs';
import { isMusicLibraryGenreLetterSegment } from '@/lib/music-library-urls';

export const CATALOG_GENRE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CATALOG_GENRE_NAME_MAX = 120;
export const CATALOG_GENRE_SLUG_MAX = 80;
export const CATALOG_GENRE_NAME_JA_MAX = 120;
export const CATALOG_GENRE_DESCRIPTION_JA_MAX = 4000;
export const CATALOG_GENRE_PARENT_MAX = 120;

export const CATALOG_GENRE_TABLE_HINT =
  'docs/sql/music8-catalog-extension.sql を Supabase SQL Editor で実行してください。';

export type CatalogGenreRow = {
  id: string;
  slug: string;
  name: string;
  name_ja: string | null;
  description_ja: string | null;
  parent_genre: string | null;
  wp_term_id: number | null;
  created_at: string | null;
  song_count: number | null;
};

export type CatalogGenreWriteInput = {
  name: string;
  slug: string;
  name_ja: string | null;
  description_ja: string | null;
  parent_genre: string | null;
  wp_term_id: number | null;
};

export type CatalogGenreParseFailure = {
  ok: false;
  error: string;
};

export type CatalogGenreParseSuccess = {
  ok: true;
  value: CatalogGenreWriteInput;
};

export function isCatalogGenreId(raw: string | null | undefined): boolean {
  return Boolean(raw && CATALOG_GENRE_UUID_RE.test(raw.trim()));
}

export function isCatalogGenreTableMissingError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /catalog_genres|song_genres/i.test(message)
  );
}

export function nullableTrimmed(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function parseCatalogGenreWpTermId(raw: unknown): number | null | undefined {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    if (!/^\d+$/.test(t)) return undefined;
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) return undefined;
    return n;
  }
  return undefined;
}

/** 公開 `/music/genres/[segment]` の文字索引と衝突する slug は使わない。 */
export function isBlockedCatalogGenreSlug(slug: string): boolean {
  return isMusicLibraryGenreLetterSegment(slug);
}

export function normalizeCatalogGenreSlug(raw: string): string {
  return slugifyCatalogLabel(raw).slice(0, CATALOG_GENRE_SLUG_MAX);
}

export function resolveCatalogGenreSlug(rawSlug: unknown, name: string): string | null {
  const fromInput = typeof rawSlug === 'string' ? normalizeCatalogGenreSlug(rawSlug) : '';
  if (fromInput) return fromInput;
  const fromName = normalizeCatalogGenreSlug(name);
  return fromName || null;
}

export function parseCatalogGenreWriteBody(
  body: Record<string, unknown>,
  opts?: { requireName?: boolean },
): CatalogGenreParseSuccess | CatalogGenreParseFailure {
  const requireName = opts?.requireName !== false;
  const name = normalizeCatalogGenreName(typeof body.name === 'string' ? body.name : '');
  if (requireName && !name) {
    return { ok: false, error: 'ジャンル名を入力してください。' };
  }
  if (name.length > CATALOG_GENRE_NAME_MAX) {
    return { ok: false, error: `ジャンル名は ${CATALOG_GENRE_NAME_MAX} 文字以内にしてください。` };
  }

  const slug = resolveCatalogGenreSlug(body.slug, name);
  if (!slug) {
    return {
      ok: false,
      error: 'slug は英数字で入力してください（日本語名のみのときは手動で指定）。',
    };
  }
  if (isBlockedCatalogGenreSlug(slug)) {
    return {
      ok: false,
      error: `slug「${slug}」はジャンル索引の文字ページと衝突するため使えません。`,
    };
  }

  if (body.wp_term_id !== undefined) {
    const wp = parseCatalogGenreWpTermId(body.wp_term_id);
    if (wp === undefined) {
      return { ok: false, error: 'WP term ID は 1 以上の整数にしてください。' };
    }
  }

  const nameJa = nullableTrimmed(body.name_ja, CATALOG_GENRE_NAME_JA_MAX);
  const descriptionJa = nullableTrimmed(body.description_ja, CATALOG_GENRE_DESCRIPTION_JA_MAX);
  const parentGenre = nullableTrimmed(body.parent_genre, CATALOG_GENRE_PARENT_MAX);
  const wpTermId =
    body.wp_term_id === undefined ? null : (parseCatalogGenreWpTermId(body.wp_term_id) ?? null);

  return {
    ok: true,
    value: {
      name: name || slug,
      slug,
      name_ja: nameJa,
      description_ja: descriptionJa,
      parent_genre: parentGenre,
      wp_term_id: wpTermId,
    },
  };
}

export function mapCatalogGenreRow(
  raw: Record<string, unknown>,
  songCount?: number | null,
): CatalogGenreRow | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!isCatalogGenreId(id)) return null;
  const name = normalizeCatalogGenreName(typeof raw.name === 'string' ? raw.name : '');
  const slugRaw = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
  const slug = slugRaw || (name ? normalizeCatalogGenreSlug(name) : '');
  if (!name && !slug) return null;
  const nested = raw.song_genres;
  let count = songCount ?? null;
  if (count == null && Array.isArray(nested) && nested[0] && typeof nested[0] === 'object') {
    const c = (nested[0] as { count?: unknown }).count;
    if (typeof c === 'number' && Number.isFinite(c)) count = c;
  }
  return {
    id,
    slug: slug || id,
    name: name || slug,
    name_ja: nullableTrimmed(raw.name_ja, CATALOG_GENRE_NAME_JA_MAX),
    description_ja: nullableTrimmed(raw.description_ja, CATALOG_GENRE_DESCRIPTION_JA_MAX),
    parent_genre: nullableTrimmed(raw.parent_genre, CATALOG_GENRE_PARENT_MAX),
    wp_term_id: parseCatalogGenreWpTermId(raw.wp_term_id) ?? null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    song_count: count,
  };
}

export const CATALOG_GENRE_SELECT =
  'id, slug, name, name_ja, description_ja, parent_genre, wp_term_id, created_at';

export const CATALOG_GENRE_SELECT_WITH_COUNT = `${CATALOG_GENRE_SELECT}, song_genres(count)`;
