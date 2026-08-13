/**
 * 特集ページ（管理キュレーション・部屋チャット導線）
 */

import type { FeaturedPageStyle } from '@/lib/featured-page-styles';
import { isFeaturedPageStyle, parseFeaturedPageStyle } from '@/lib/featured-page-styles';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FeaturedPageRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  published: boolean;
  ai_usage_free: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FeaturedPageArtistRow = {
  id: string;
  featured_page_id: string;
  artist_name: string;
  artist_id: string | null;
  style: FeaturedPageStyle;
  /** 自由入力。部屋では `artist_name (label_note)` と表示 */
  label_note: string | null;
  sort_order: number;
  created_at: string;
};

export type FeaturedPageWithArtists = FeaturedPageRow & {
  artists: FeaturedPageArtistRow[];
};

export function slugifyFeaturedPageTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[！!？?・。、，,．.]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || `featured-${Date.now().toString(36)}`;
}

export function normalizeArtistNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 部屋・管理表示用。例: DAVID BYRNE (Talking Heads) */
export function formatFeaturedArtistDisplayLabel(
  artistName: string,
  labelNote?: string | null,
): string {
  const name = artistName.trim();
  const note = typeof labelNote === 'string' ? labelNote.trim() : '';
  if (!name) return note ? `(${note})` : '';
  if (!note) return name;
  return `${name} (${note})`;
}

export function normalizeFeaturedLabelNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, 120);
  return t || null;
}

export function isFeaturedPageTableMissingError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /relation|does not exist|schema cache/i.test(message) &&
    /featured_pages|featured_page_artists/i.test(message)
  );
}

type AdminLike = Pick<SupabaseClient, 'from'>;

/**
 * 特集経由の AI 無料が有効か（公開＋フラグ＋アーティスト登録済み）。
 */
export async function resolveFeaturedPageAiUsageFree(params: {
  admin: AdminLike;
  featuredPageId: string;
  artistName: string;
}): Promise<{ ok: true; pageTitle: string } | { ok: false; reason: string }> {
  const pageId = params.featuredPageId.trim();
  const artistName = params.artistName.trim();
  if (!pageId || !artistName) {
    return { ok: false, reason: 'missing_params' };
  }

  const { data: page, error: pageErr } = await params.admin
    .from('featured_pages')
    .select('id, title, published, ai_usage_free')
    .eq('id', pageId)
    .maybeSingle();

  if (pageErr) {
    if (isFeaturedPageTableMissingError(pageErr.message)) {
      return { ok: false, reason: 'table_missing' };
    }
    return { ok: false, reason: 'page_load_failed' };
  }
  if (!page || typeof page !== 'object') {
    return { ok: false, reason: 'page_not_found' };
  }
  const published = (page as { published?: boolean }).published === true;
  const aiFree = (page as { ai_usage_free?: boolean }).ai_usage_free === true;
  if (!published || !aiFree) {
    return { ok: false, reason: 'not_free' };
  }

  const { data: artists, error: artErr } = await params.admin
    .from('featured_page_artists')
    .select('artist_name')
    .eq('featured_page_id', pageId);

  if (artErr) {
    return { ok: false, reason: 'artists_load_failed' };
  }

  const want = normalizeArtistNameKey(artistName);
  const hit = (artists ?? []).some(
    (row) => normalizeArtistNameKey(String((row as { artist_name?: string }).artist_name ?? '')) === want,
  );
  if (!hit) {
    return { ok: false, reason: 'artist_not_on_page' };
  }

  const title =
    typeof (page as { title?: string }).title === 'string'
      ? (page as { title: string }).title.trim()
      : '';
  return { ok: true, pageTitle: title || '特集' };
}

export function mapFeaturedPageArtistRow(raw: Record<string, unknown>): FeaturedPageArtistRow | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const featured_page_id = typeof raw.featured_page_id === 'string' ? raw.featured_page_id : '';
  const artist_name = typeof raw.artist_name === 'string' ? raw.artist_name.trim() : '';
  if (!id || !featured_page_id || !artist_name) return null;
  const style = parseFeaturedPageStyle(raw.style) ?? 'Other';
  if (!isFeaturedPageStyle(style)) return null;
  return {
    id,
    featured_page_id,
    artist_name,
    artist_id: typeof raw.artist_id === 'string' ? raw.artist_id : null,
    style,
    label_note: normalizeFeaturedLabelNote(raw.label_note),
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : Number(raw.sort_order) || 0,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
  };
}

export function mapFeaturedPageRow(raw: Record<string, unknown>): FeaturedPageRow | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  if (!id || !title || !slug) return null;
  return {
    id,
    title,
    slug,
    description: typeof raw.description === 'string' ? raw.description : null,
    published: raw.published === true,
    ai_usage_free: raw.ai_usage_free === true,
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : Number(raw.sort_order) || 0,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}
