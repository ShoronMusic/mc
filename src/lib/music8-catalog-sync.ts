/**
 * Music8 WP 曲 JSON → catalog_* / song_* 中間テーブル同期。
 * テーブル未作成（42P01）のときは静かにスキップする。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';
import {
  asRecord,
  music8NavStyleSlugFromName,
  music8NavStyleSlugFromStyleIds,
  termSlugAndName,
} from '@/lib/music8-catalog-slugs';

function isMissingTable(err: { code?: string } | null | undefined): boolean {
  return err?.code === '42P01' || err?.code === '42703';
}

async function upsertNamedTerm(
  admin: SupabaseClient,
  table: 'catalog_genres' | 'catalog_vocals' | 'catalog_tags',
  slug: string,
  name: string,
  wpTermId: number | null,
): Promise<string | null> {
  const payload: Record<string, unknown> = { slug, name };
  if (wpTermId != null) payload.wp_term_id = wpTermId;
  const { data, error } = await admin
    .from(table)
    .upsert(payload, { onConflict: 'slug' })
    .select('id')
    .maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) {
    console.warn(`[music8-catalog] upsert ${table} ${slug}:`, error.code, error.message);
    return null;
  }
  return typeof data?.id === 'string' ? data.id : null;
}

async function replaceSongLinks(
  admin: SupabaseClient,
  table: 'song_genres' | 'song_vocals' | 'song_tags' | 'song_styles',
  songId: string,
  fkColumn: 'genre_id' | 'vocal_id' | 'tag_id' | 'style_id',
  ids: string[],
): Promise<void> {
  const del = await admin.from(table).delete().eq('song_id', songId);
  if (isMissingTable(del.error)) return;
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({ song_id: songId, [fkColumn]: id }));
  const { error } = await admin.from(table).insert(rows);
  if (error && !isMissingTable(error)) {
    console.warn(`[music8-catalog] insert ${table}:`, error.code, error.message);
  }
}

async function resolveStyleIds(admin: SupabaseClient, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await admin.from('catalog_styles').select('id, slug').in('slug', slugs);
  if (isMissingTable(error) || error || !data) return [];
  const bySlug = new Map<string, string>();
  for (const row of data as { id?: string; slug?: string }[]) {
    if (row.id && row.slug) bySlug.set(row.slug, row.id);
  }
  return slugs.map((s) => bySlug.get(s)).filter((id): id is string => Boolean(id));
}

export type SyncMusic8CatalogTaxonomyResult = {
  styles: number;
  genres: number;
  vocals: number;
  tags: number;
  isLiked: boolean;
  skippedMissingTables: boolean;
};

/**
 * 1 曲の WP JSON（または同等）から style/genre/vocal/tag と is_liked を同期する。
 */
export async function syncMusic8CatalogTaxonomyFromSongJson(
  admin: SupabaseClient,
  songId: string,
  json: unknown,
): Promise<SyncMusic8CatalogTaxonomyResult> {
  const empty: SyncMusic8CatalogTaxonomyResult = {
    styles: 0,
    genres: 0,
    vocals: 0,
    tags: 0,
    isLiked: false,
    skippedMissingTables: false,
  };
  const obj = asRecord(json);
  const extracted = extractMusic8SongFields(json);

  const styleSlugs = new Set<string>();
  const fromIds = music8NavStyleSlugFromStyleIds(extracted.styleIds);
  if (fromIds) styleSlugs.add(fromIds);
  for (const name of extracted.styleNames) {
    const slug = music8NavStyleSlugFromName(name);
    if (slug) styleSlugs.add(slug);
  }
  const extraStyles = obj && (obj.styles ?? obj.style);
  if (Array.isArray(extraStyles)) {
    for (const x of extraStyles) {
      if (typeof x === 'string') {
        const slug = music8NavStyleSlugFromName(x) ?? (x.trim().toLowerCase() || null);
        if (slug) styleSlugs.add(slug);
      }
    }
  } else if (typeof extraStyles === 'string') {
    const slug = music8NavStyleSlugFromName(extraStyles);
    if (slug) styleSlugs.add(slug);
  }

  const genreTerms = (obj && Array.isArray(obj.genres) ? obj.genres : [])
    .map(termSlugAndName)
    .filter((t): t is NonNullable<ReturnType<typeof termSlugAndName>> => t != null);
  if (genreTerms.length === 0) {
    for (const name of extracted.genres) {
      const t = termSlugAndName(name);
      if (t) genreTerms.push(t);
    }
  }

  const vocalSrc = obj && (obj.vocal_data ?? obj.vocals);
  const vocalTerms = (Array.isArray(vocalSrc) ? vocalSrc : [])
    .map(termSlugAndName)
    .filter((t): t is NonNullable<ReturnType<typeof termSlugAndName>> => t != null);
  if (vocalTerms.length === 0 && extracted.vocalLabel) {
    const t = termSlugAndName(extracted.vocalLabel);
    if (t) vocalTerms.push(t);
  }

  const tagSrc = obj && (obj.tags ?? obj.tag_data ?? obj.post_tags);
  const tagTerms = (Array.isArray(tagSrc) ? tagSrc : [])
    .map(termSlugAndName)
    .filter((t): t is NonNullable<ReturnType<typeof termSlugAndName>> => t != null);

  const acf = obj ? asRecord(obj.acf) : null;
  const likeRaw = acf?.likecount ?? obj?.likecount;
  const isLiked =
    likeRaw === true ||
    likeRaw === '1' ||
    likeRaw === 1 ||
    (Array.isArray(likeRaw) && likeRaw.length > 0);

  const styleIds = await resolveStyleIds(admin, [...styleSlugs]);
  if (styleSlugs.size > 0 && styleIds.length === 0) {
    empty.skippedMissingTables = true;
  }

  await replaceSongLinks(admin, 'song_styles', songId, 'style_id', styleIds);

  const genreIds: string[] = [];
  for (const t of genreTerms) {
    const id = await upsertNamedTerm(admin, 'catalog_genres', t.slug, t.name, t.wpTermId);
    if (id) genreIds.push(id);
  }
  await replaceSongLinks(admin, 'song_genres', songId, 'genre_id', genreIds);

  const vocalIds: string[] = [];
  for (const t of vocalTerms) {
    const id = await upsertNamedTerm(admin, 'catalog_vocals', t.slug, t.name, t.wpTermId);
    if (id) vocalIds.push(id);
  }
  await replaceSongLinks(admin, 'song_vocals', songId, 'vocal_id', vocalIds);

  const tagIds: string[] = [];
  for (const t of tagTerms) {
    const id = await upsertNamedTerm(admin, 'catalog_tags', t.slug, t.name, t.wpTermId);
    if (id) tagIds.push(id);
  }
  await replaceSongLinks(admin, 'song_tags', songId, 'tag_id', tagIds);

  const { error: likeErr } = await admin.from('songs').update({ is_liked: isLiked }).eq('id', songId);
  if (isMissingTable(likeErr)) {
    empty.skippedMissingTables = true;
  }

  return {
    styles: styleIds.length,
    genres: genreIds.length,
    vocals: vocalIds.length,
    tags: tagIds.length,
    isLiked,
    skippedMissingTables: empty.skippedMissingTables,
  };
}

export async function patchArtistWpTermFromSongJson(
  admin: SupabaseClient,
  json: unknown,
): Promise<number> {
  const obj = asRecord(json);
  const artists = obj && Array.isArray(obj.artists) ? obj.artists : [];
  let patched = 0;
  for (const raw of artists) {
    const a = asRecord(raw);
    if (!a) continue;
    const slug = typeof a.slug === 'string' ? a.slug.trim() : '';
    const idRaw = a.id;
    const wpTermId =
      typeof idRaw === 'number' && Number.isFinite(idRaw)
        ? idRaw
        : typeof idRaw === 'string' && Number.isFinite(Number(idRaw))
          ? Number(idRaw)
          : null;
    if (!slug || wpTermId == null) continue;
    const acf = asRecord(a.acf);
    const occRaw = acf?.Occupation ?? acf?.occupation;
    const occupations = Array.isArray(occRaw)
      ? occRaw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const related =
      typeof acf?.related_artists === 'string' ? acf.related_artists.trim() : null;
    const payload: Record<string, unknown> = { wp_term_id: wpTermId };
    if (occupations.length) payload.occupations = occupations;
    if (related) payload.related_artists_raw = related;
    const { error } = await admin.from('artists').update(payload).eq('music8_artist_slug', slug);
    if (isMissingTable(error)) return patched;
    if (!error) patched += 1;
  }
  return patched;
}
