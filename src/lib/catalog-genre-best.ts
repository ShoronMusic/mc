/**
 * Genre BEST（WP CPT playlist → catalog_playlists*）
 * 仕様: docs/00-genre-best-spec.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const GENRE_BEST_STYLE_ORDER = [
  'Pop',
  'Dance',
  'Alternative',
  'Electronica',
  'R&B',
  'Hip-hop',
  'Rock',
  'metal',
  'others',
] as const;

export type GenreBestTabKey = 'genre' | 'updated' | (typeof GENRE_BEST_STYLE_ORDER)[number] | string;

export type GenreBestListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  wpPostId: number | null;
  styles: string[];
  songCount: number;
  lastSongUpdatedAt: string | null;
  updatedAtMs: number;
};

export type GenreBestSongLabel = {
  slug: string;
  title: string;
};

export type GenreBestDetailSong = {
  songId: string;
  position: number;
  songTitle: string | null;
  displayTitle: string | null;
  mainArtist: string | null;
  originalReleaseDate: string | null;
  spotifyImages: string | null;
  videoId: string | null;
  music8SongId: number | null;
};

export type GenreBestDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  wpPostId: number | null;
  styles: string[];
  isGenreTab: boolean;
  showGenreBestSubtitle: boolean;
  lastSongUpdatedAt: string | null;
  songs: GenreBestDetailSong[];
};

export function isCatalogPlaylistTableMissingError(message: string | undefined | null): boolean {
  const m = String(message ?? '').toLowerCase();
  return (
    m.includes('catalog_playlists') &&
    (m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find'))
  );
}

export function normalizeStyleKey(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function styleKeysMatch(a: string, b: string): boolean {
  return normalizeStyleKey(a) === normalizeStyleKey(b);
}

export function isGenrePlaylistStyles(styles: string[] | null | undefined): boolean {
  return !Array.isArray(styles) || styles.length === 0;
}

export function playlistMatchesStyle(styles: string[], styleName: string): boolean {
  return styles.some((s) => styleKeysMatch(s, styleName));
}

export function genreBestTabParam(key: GenreBestTabKey): string {
  const t = String(key ?? '').trim();
  if (!t) return 'genre';
  const lower = t.toLowerCase();
  if (lower === 'genre') return 'genre';
  if (lower === 'updated') return 'updated';
  return normalizeStyleKey(t) || lower;
}

export function parseGenreBestTabKey(raw: string | null | undefined): GenreBestTabKey {
  const t = (raw ?? '').trim();
  if (!t) return 'genre';
  const lower = t.toLowerCase();
  if (lower === 'genre') return 'genre';
  if (lower === 'updated') return 'updated';
  const found = GENRE_BEST_STYLE_ORDER.find((s) => normalizeStyleKey(s) === normalizeStyleKey(t));
  return found ?? t;
}

export function genreBestTabsEqual(a: GenreBestTabKey, b: GenreBestTabKey): boolean {
  if (a === 'genre' || b === 'genre' || a === 'updated' || b === 'updated') {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
  return styleKeysMatch(String(a), String(b));
}

export function buildGenreBestTabGroups(
  items: Array<{ styles: string[] }>,
): Array<{ key: GenreBestTabKey; label: string }> {
  const groups: Array<{ key: GenreBestTabKey; label: string }> = [];
  if (items.some((p) => isGenrePlaylistStyles(p.styles))) {
    groups.push({ key: 'genre', label: 'Genre' });
  }
  for (const styleName of GENRE_BEST_STYLE_ORDER) {
    if (items.some((p) => playlistMatchesStyle(p.styles, styleName))) {
      groups.push({ key: styleName, label: styleName });
    }
  }
  groups.push({ key: 'updated', label: '更新順' });
  return groups;
}

export function filterGenreBestByTab(
  items: GenreBestListItem[],
  tab: GenreBestTabKey,
): GenreBestListItem[] {
  let filtered: GenreBestListItem[];
  if (tab === 'updated') {
    filtered = items.slice();
  } else if (tab === 'genre') {
    filtered = items.filter((p) => isGenrePlaylistStyles(p.styles));
  } else {
    filtered = items.filter((p) => playlistMatchesStyle(p.styles, String(tab)));
  }
  return sortGenreBestForTab(filtered, tab);
}

export function sortGenreBestForTab(
  items: GenreBestListItem[],
  tab: GenreBestTabKey,
): GenreBestListItem[] {
  const sorted = items.slice();
  if (tab === 'updated') {
    sorted.sort((a, b) => {
      const d = b.updatedAtMs - a.updatedAtMs;
      if (d !== 0) return d;
      return a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true });
    });
  } else {
    sorted.sort((a, b) =>
      a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }),
    );
  }
  return sorted;
}

export function slugifyGenreBestTitle(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `genre-best-${Date.now()}`;
}

function updatedAtMsFromRow(lastSongUpdatedAt: string | null, updatedAt: string | null): number {
  const raw = lastSongUpdatedAt || updatedAt;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

type PlaylistRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url?: string | null;
  wp_post_id: number | null;
  last_song_updated_at: string | null;
  updated_at?: string | null;
};

export async function listGenreBestPlaylists(
  admin: SupabaseClient,
): Promise<{ items: GenreBestListItem[]; error: string | null; tableMissing?: boolean }> {
  const { data, error } = await admin
    .from('catalog_playlists')
    .select('id, slug, title, description, cover_image_url, wp_post_id, last_song_updated_at, updated_at')
    .order('title', { ascending: true });

  if (error) {
    if (isCatalogPlaylistTableMissingError(error.message)) {
      return { items: [], error: error.message, tableMissing: true };
    }
    return { items: [], error: error.message };
  }

  const rows = (data as PlaylistRow[] | null) ?? [];
  if (rows.length === 0) return { items: [], error: null };

  const ids = rows.map((r) => r.id);
  const styleNamesByPlaylist = new Map<string, string[]>();
  const countByPlaylist = new Map<string, number>();

  const { data: styleLinks, error: styleErr } = await admin
    .from('catalog_playlist_styles')
    .select('playlist_id, catalog_styles(name)')
    .in('playlist_id', ids);
  if (styleErr && !isCatalogPlaylistTableMissingError(styleErr.message)) {
    console.error('[genre-best] styles', styleErr.message);
  } else if (Array.isArray(styleLinks)) {
    for (const link of styleLinks as Array<{
      playlist_id?: string;
      catalog_styles?: { name?: string } | { name?: string }[] | null;
    }>) {
      if (!link.playlist_id) continue;
      const st = link.catalog_styles;
      const name = Array.isArray(st)
        ? st[0]?.name
        : st && typeof st === 'object'
          ? st.name
          : undefined;
      if (!name) continue;
      const arr = styleNamesByPlaylist.get(link.playlist_id) ?? [];
      arr.push(name);
      styleNamesByPlaylist.set(link.playlist_id, arr);
    }
  }

  const { data: songLinks, error: songErr } = await admin
    .from('catalog_playlist_songs')
    .select('playlist_id')
    .in('playlist_id', ids);
  if (songErr && !isCatalogPlaylistTableMissingError(songErr.message)) {
    console.error('[genre-best] song counts', songErr.message);
  } else if (Array.isArray(songLinks)) {
    for (const link of songLinks as Array<{ playlist_id?: string }>) {
      if (!link.playlist_id) continue;
      countByPlaylist.set(link.playlist_id, (countByPlaylist.get(link.playlist_id) ?? 0) + 1);
    }
  }

  const items: GenreBestListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? null,
    coverImageUrl:
      typeof r.cover_image_url === 'string' && r.cover_image_url.trim()
        ? r.cover_image_url.trim()
        : null,
    wpPostId: typeof r.wp_post_id === 'number' ? r.wp_post_id : null,
    styles: styleNamesByPlaylist.get(r.id) ?? [],
    songCount: countByPlaylist.get(r.id) ?? 0,
    lastSongUpdatedAt: r.last_song_updated_at ?? null,
    updatedAtMs: updatedAtMsFromRow(r.last_song_updated_at ?? null, r.updated_at ?? null),
  }));

  return { items, error: null };
}

export async function getGenreBestBySlug(
  admin: SupabaseClient,
  slug: string,
): Promise<{ detail: GenreBestDetail | null; error: string | null; tableMissing?: boolean }> {
  const s = slug.trim();
  if (!s) return { detail: null, error: 'slug が必要です。' };

  const { data, error } = await admin
    .from('catalog_playlists')
    .select('id, slug, title, description, cover_image_url, wp_post_id, last_song_updated_at, updated_at')
    .eq('slug', s)
    .maybeSingle();

  if (error) {
    if (isCatalogPlaylistTableMissingError(error.message)) {
      return { detail: null, error: error.message, tableMissing: true };
    }
    return { detail: null, error: error.message };
  }
  if (!data) return { detail: null, error: null };

  const row = data as PlaylistRow;
  const styles: string[] = [];
  const { data: styleLinks } = await admin
    .from('catalog_playlist_styles')
    .select('catalog_styles(name)')
    .eq('playlist_id', row.id);
  if (Array.isArray(styleLinks)) {
    for (const link of styleLinks as Array<{
      catalog_styles?: { name?: string } | { name?: string }[] | null;
    }>) {
      const st = link.catalog_styles;
      const name = Array.isArray(st)
        ? st[0]?.name
        : st && typeof st === 'object'
          ? st.name
          : undefined;
      if (name) styles.push(name);
    }
  }

  const { data: songLinks, error: songErr } = await admin
    .from('catalog_playlist_songs')
    .select('song_id, position')
    .eq('playlist_id', row.id)
    .order('position', { ascending: true });
  if (songErr) {
    return { detail: null, error: songErr.message };
  }

  const linkRows = (songLinks as Array<{ song_id: string; position: number }> | null) ?? [];
  const songIds = linkRows.map((l) => l.song_id);
  const songById = new Map<
    string,
    {
      song_title: string | null;
      display_title: string | null;
      main_artist: string | null;
      original_release_date: string | null;
      spotify_images: string | null;
      music8_video_id: string | null;
      music8_song_id: number | null;
    }
  >();
  const videoBySong = new Map<string, string>();

  if (songIds.length > 0) {
    const { data: songs } = await admin
      .from('songs')
      .select(
        'id, song_title, display_title, main_artist, original_release_date, spotify_images, music8_video_id, music8_song_id',
      )
      .in('id', songIds);
    if (Array.isArray(songs)) {
      for (const song of songs as Array<{
        id: string;
        song_title: string | null;
        display_title: string | null;
        main_artist: string | null;
        original_release_date: string | null;
        spotify_images: string | null;
        music8_video_id: string | null;
        music8_song_id: number | null;
      }>) {
        songById.set(song.id, song);
      }
    }
    const { data: vids } = await admin
      .from('song_videos')
      .select('song_id, video_id')
      .in('song_id', songIds);
    if (Array.isArray(vids)) {
      for (const v of vids as Array<{ song_id?: string; video_id?: string }>) {
        if (v.song_id && v.video_id && !videoBySong.has(v.song_id)) {
          videoBySong.set(v.song_id, v.video_id);
        }
      }
    }
  }

  const detailSongs: GenreBestDetailSong[] = linkRows.map((l) => {
    const song = songById.get(l.song_id);
    return {
      songId: l.song_id,
      position: l.position,
      songTitle: song?.song_title ?? null,
      displayTitle: song?.display_title ?? null,
      mainArtist: song?.main_artist ?? null,
      originalReleaseDate: song?.original_release_date ?? null,
      spotifyImages:
        typeof song?.spotify_images === 'string' && song.spotify_images.trim()
          ? song.spotify_images.trim()
          : null,
      videoId:
        (typeof song?.music8_video_id === 'string' && song.music8_video_id.trim()) ||
        videoBySong.get(l.song_id) ||
        null,
      music8SongId: typeof song?.music8_song_id === 'number' ? song.music8_song_id : null,
    };
  });

  detailSongs.sort((a, b) => {
    const da = a.originalReleaseDate ? Date.parse(a.originalReleaseDate) : NaN;
    const db = b.originalReleaseDate ? Date.parse(b.originalReleaseDate) : NaN;
    const aOk = Number.isFinite(da);
    const bOk = Number.isFinite(db);
    if (aOk && bOk && da !== db) return db - da;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return a.position - b.position;
  });

  const isGenreTab = isGenrePlaylistStyles(styles);
  const desc = (row.description ?? '').trim();
  const showGenreBestSubtitle = desc.toLowerCase() === 'genre best' || isGenreTab;

  return {
    detail: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      coverImageUrl:
        typeof row.cover_image_url === 'string' && row.cover_image_url.trim()
          ? row.cover_image_url.trim()
          : null,
      wpPostId: typeof row.wp_post_id === 'number' ? row.wp_post_id : null,
      styles,
      isGenreTab,
      showGenreBestSubtitle,
      lastSongUpdatedAt: row.last_song_updated_at ?? null,
      songs: detailSongs,
    },
    error: null,
  };
}

export async function createGenreBestPlaylist(
  admin: SupabaseClient,
  input: { title: string; slug?: string; description?: string | null },
): Promise<{ item: GenreBestListItem | null; error: string | null; tableMissing?: boolean }> {
  const title = input.title.trim();
  if (!title) return { item: null, error: 'タイトルが必要です。' };
  const slug = (input.slug?.trim() || slugifyGenreBestTitle(title)).toLowerCase();
  const description =
    typeof input.description === 'string' ? input.description.trim() || null : 'Genre Best';

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('catalog_playlists')
    .insert({
      title,
      slug,
      description,
      last_song_updated_at: now,
      updated_at: now,
    })
    .select('id, slug, title, description, cover_image_url, wp_post_id, last_song_updated_at, updated_at')
    .single();

  if (error) {
    if (isCatalogPlaylistTableMissingError(error.message)) {
      return { item: null, error: error.message, tableMissing: true };
    }
    return { item: null, error: error.message };
  }

  const row = data as PlaylistRow;
  return {
    item: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      coverImageUrl: null,
      wpPostId: null,
      styles: [],
      songCount: 0,
      lastSongUpdatedAt: row.last_song_updated_at ?? null,
      updatedAtMs: updatedAtMsFromRow(row.last_song_updated_at ?? null, row.updated_at ?? null),
    },
    error: null,
  };
}

export async function addSongToGenreBest(
  admin: SupabaseClient,
  playlistIdOrSlug: string,
  songId: string,
): Promise<{ ok: boolean; error: string | null; already?: boolean; tableMissing?: boolean }> {
  const songIdTrim = songId.trim();
  if (!songIdTrim) return { ok: false, error: 'songId が必要です。' };

  let playlistId = playlistIdOrSlug.trim();
  if (!playlistId) return { ok: false, error: 'playlist が必要です。' };

  if (!/^[0-9a-f-]{36}$/i.test(playlistId)) {
    const { data, error } = await admin
      .from('catalog_playlists')
      .select('id')
      .eq('slug', playlistId)
      .maybeSingle();
    if (error) {
      if (isCatalogPlaylistTableMissingError(error.message)) {
        return { ok: false, error: error.message, tableMissing: true };
      }
      return { ok: false, error: error.message };
    }
    if (!data?.id) return { ok: false, error: 'Genre BEST が見つかりません。' };
    playlistId = data.id as string;
  }

  const { data: existing } = await admin
    .from('catalog_playlist_songs')
    .select('song_id')
    .eq('playlist_id', playlistId)
    .eq('song_id', songIdTrim)
    .maybeSingle();
  if (existing) return { ok: true, error: null, already: true };

  const { data: maxRow } = await admin
    .from('catalog_playlist_songs')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos =
    typeof maxRow?.position === 'number' && Number.isFinite(maxRow.position)
      ? maxRow.position + 1
      : 0;

  const { error: insErr } = await admin.from('catalog_playlist_songs').insert({
    playlist_id: playlistId,
    song_id: songIdTrim,
    position: nextPos,
  });
  if (insErr) {
    if (isCatalogPlaylistTableMissingError(insErr.message)) {
      return { ok: false, error: insErr.message, tableMissing: true };
    }
    return { ok: false, error: insErr.message };
  }

  const now = new Date().toISOString();
  await admin
    .from('catalog_playlists')
    .update({ last_song_updated_at: now, updated_at: now })
    .eq('id', playlistId);

  return { ok: true, error: null };
}

export async function removeSongFromGenreBest(
  admin: SupabaseClient,
  playlistIdOrSlug: string,
  songId: string,
): Promise<{ ok: boolean; error: string | null; tableMissing?: boolean }> {
  const songIdTrim = songId.trim();
  if (!songIdTrim) return { ok: false, error: 'songId が必要です。' };

  let playlistId = playlistIdOrSlug.trim();
  if (!playlistId) return { ok: false, error: 'playlist が必要です。' };

  if (!/^[0-9a-f-]{36}$/i.test(playlistId)) {
    const { data, error } = await admin
      .from('catalog_playlists')
      .select('id')
      .eq('slug', playlistId)
      .maybeSingle();
    if (error) {
      if (isCatalogPlaylistTableMissingError(error.message)) {
        return { ok: false, error: error.message, tableMissing: true };
      }
      return { ok: false, error: error.message };
    }
    if (!data?.id) return { ok: false, error: 'Genre BEST が見つかりません。' };
    playlistId = data.id as string;
  }

  const { error } = await admin
    .from('catalog_playlist_songs')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('song_id', songIdTrim);
  if (error) {
    if (isCatalogPlaylistTableMissingError(error.message)) {
      return { ok: false, error: error.message, tableMissing: true };
    }
    return { ok: false, error: error.message };
  }

  const now = new Date().toISOString();
  await admin
    .from('catalog_playlists')
    .update({ last_song_updated_at: now, updated_at: now })
    .eq('id', playlistId);

  return { ok: true, error: null };
}

export async function getGenreBestLabelsForSongs(
  admin: SupabaseClient,
  songIds: string[],
): Promise<{
  bySongId: Record<string, GenreBestSongLabel[]>;
  error: string | null;
  tableMissing?: boolean;
}> {
  const ids = [...new Set(songIds.map((s) => s.trim()).filter(Boolean))];
  const bySongId: Record<string, GenreBestSongLabel[]> = {};
  for (const id of ids) bySongId[id] = [];
  if (ids.length === 0) return { bySongId, error: null };

  const { data, error } = await admin
    .from('catalog_playlist_songs')
    .select('song_id, catalog_playlists(slug, title)')
    .in('song_id', ids);

  if (error) {
    if (isCatalogPlaylistTableMissingError(error.message)) {
      return { bySongId, error: error.message, tableMissing: true };
    }
    return { bySongId, error: error.message };
  }

  if (Array.isArray(data)) {
    for (const row of data as Array<{
      song_id?: string;
      catalog_playlists?:
        | { slug?: string; title?: string }
        | { slug?: string; title?: string }[]
        | null;
    }>) {
      if (!row.song_id) continue;
      const pl = row.catalog_playlists;
      const one = Array.isArray(pl) ? pl[0] : pl;
      const slug = typeof one?.slug === 'string' ? one.slug.trim() : '';
      const title = typeof one?.title === 'string' ? one.title.trim() : '';
      if (!slug || !title) continue;
      const arr = bySongId[row.song_id] ?? (bySongId[row.song_id] = []);
      if (!arr.some((x) => x.slug === slug)) {
        arr.push({ slug, title });
      }
    }
  }

  for (const id of ids) {
    bySongId[id]?.sort((a, b) =>
      a.title.localeCompare(b.title, 'en', { sensitivity: 'base', numeric: true }),
    );
  }

  return { bySongId, error: null };
}
