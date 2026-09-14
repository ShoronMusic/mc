/**
 * Music8 公開キー（`music8_artist_slug` / `music8_song_slug`）。
 * 既存 WP slug は上書きしない。新規はタイトルのハイフン化。
 * 同一アーティストでファイル名が衝突するときだけ `-2` 以降。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';

export function hyphenateMusic8LabelSlug(raw: string): string {
  const s = (raw ?? '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s;
}

/** 曲名 → slug。先頭 The は残す（The Hills → the-hills）。 */
export function songTitleToMusic8Slug(songTitle: string): string {
  return hyphenateMusic8LabelSlug(songTitle);
}

/**
 * 同一アーティスト内で未使用の曲 slug。
 * `taken` は既存の `music8_song_slug`（現在曲は含めない）。
 */
export function uniquifyMusic8SongSlug(base: string, taken: Iterable<string>): string {
  const root = (base ?? '').trim().toLowerCase();
  if (!root) return '';
  const used = new Set(
    [...taken].map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  if (!used.has(root)) return root;
  let n = 2;
  while (used.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export type EnsureMusic8SlugsResult =
  | {
      ok: true;
      songId: string;
      artistSlug: string;
      songSlug: string;
      patched: boolean;
      artistSlugAssigned: boolean;
      songSlugAssigned: boolean;
    }
  | { ok: false; songId: string; reason: string };

type SongSlugRow = {
  id?: string;
  main_artist?: string | null;
  song_title?: string | null;
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
  artist_id?: string | null;
};

async function loadTakenSongSlugsForArtist(
  admin: SupabaseClient,
  artistSlug: string,
  exceptSongId: string,
): Promise<Set<string>> {
  const taken = new Set<string>();
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_song_slug')
      .eq('music8_artist_slug', artistSlug)
      .not('music8_song_slug', 'is', null)
      .range(offset, offset + page - 1);
    if (error) {
      if (error.code === '42P01' || error.code === '42703') return taken;
      throw error;
    }
    const rows = (data ?? []) as { id?: string; music8_song_slug?: string | null }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      const id = (r.id ?? '').trim();
      if (id && id === exceptSongId) continue;
      const slug = (r.music8_song_slug ?? '').trim().toLowerCase();
      if (slug) taken.add(slug);
    }
    if (rows.length < page) break;
  }
  return taken;
}

async function artistSlugFromArtistId(
  admin: SupabaseClient,
  artistId: string | null | undefined,
): Promise<string> {
  const id = (artistId ?? '').trim();
  if (!id) return '';
  const { data, error } = await admin
    .from('artists')
    .select('music8_artist_slug')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === '42703') return '';
    throw error;
  }
  return ((data as { music8_artist_slug?: string | null } | null)?.music8_artist_slug ?? '')
    .trim()
    .toLowerCase();
}

/**
 * slug が空の曲に Music8 キーを付ける。既にある値は維持する。
 */
export async function ensureMusic8SlugsForSong(
  admin: SupabaseClient,
  songId: string,
): Promise<EnsureMusic8SlugsResult> {
  const id = songId.trim();
  if (!id) return { ok: false, songId, reason: 'empty_song_id' };

  const { data, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, music8_artist_slug, music8_song_slug, artist_id')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      return { ok: false, songId: id, reason: 'missing_columns' };
    }
    return { ok: false, songId: id, reason: error.message };
  }
  const row = data as SongSlugRow | null;
  if (!row?.id) return { ok: false, songId: id, reason: 'song_not_found' };

  const existingArtist = (row.music8_artist_slug ?? '').trim().toLowerCase();
  const existingSong = (row.music8_song_slug ?? '').trim().toLowerCase();

  let artistSlug = existingArtist;
  if (!artistSlug) {
    artistSlug = await artistSlugFromArtistId(admin, row.artist_id);
  }
  if (!artistSlug) {
    artistSlug = artistNameToMusic8Slug(row.main_artist ?? '').trim().toLowerCase();
  }
  if (!artistSlug) {
    return { ok: false, songId: id, reason: 'artist_slug_empty' };
  }

  let songSlug = existingSong;
  let songSlugAssigned = false;
  if (!songSlug) {
    const base = songTitleToMusic8Slug(row.song_title ?? '');
    if (!base) return { ok: false, songId: id, reason: 'song_slug_empty' };
    const taken = await loadTakenSongSlugsForArtist(admin, artistSlug, id);
    songSlug = uniquifyMusic8SongSlug(base, taken);
    songSlugAssigned = songSlug !== existingSong;
  }

  const artistSlugAssigned = !existingArtist && Boolean(artistSlug);
  const patched = artistSlugAssigned || (songSlugAssigned && !existingSong);
  if (!patched) {
    return {
      ok: true,
      songId: id,
      artistSlug,
      songSlug,
      patched: false,
      artistSlugAssigned: false,
      songSlugAssigned: false,
    };
  }

  const payload: Record<string, string> = {};
  if (artistSlugAssigned) payload.music8_artist_slug = artistSlug;
  if (!existingSong && songSlug) payload.music8_song_slug = songSlug;
  if (Object.keys(payload).length === 0) {
    return {
      ok: true,
      songId: id,
      artistSlug,
      songSlug,
      patched: false,
      artistSlugAssigned: false,
      songSlugAssigned: false,
    };
  }

  const { error: updErr } = await admin.from('songs').update(payload).eq('id', id);
  if (updErr) {
    if (updErr.code === '42P01' || updErr.code === '42703') {
      return { ok: false, songId: id, reason: 'missing_columns' };
    }
    return { ok: false, songId: id, reason: updErr.message };
  }

  return {
    ok: true,
    songId: id,
    artistSlug,
    songSlug,
    patched: true,
    artistSlugAssigned,
    songSlugAssigned: Boolean(payload.music8_song_slug),
  };
}
