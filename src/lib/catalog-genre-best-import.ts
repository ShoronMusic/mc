/**
 * WP REST custom/v1/playlists → catalog_playlists*
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMusic8WpRestBaseUrl, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';
import {
  isCatalogPlaylistTableMissingError,
  normalizeStyleKey,
  styleKeysMatch,
} from '@/lib/catalog-genre-best';

const FETCH_TIMEOUT_MS = 20_000;
const DETAIL_CONCURRENCY = 4;

export type WpPlaylistListItem = {
  id?: number;
  title?: string;
  description?: string;
  thumbnail?: string | false | null;
  slug?: string;
  last_updated?: number;
  song_count?: number;
  styles?: string[];
  style?: string;
};

export type WpPlaylistDetailSong = {
  id?: number;
  title?: string;
  yt_video_id?: string;
  post_date?: string;
};

export type WpPlaylistDetail = {
  id?: number;
  title?: string;
  description?: string;
  thumbnail?: string | false | null;
  songs?: WpPlaylistDetailSong[];
};

export type GenreBestImportStats = {
  playlistsSeen: number;
  playlistsUpserted: number;
  songsLinked: number;
  songsSkippedMissing: number;
  stylesLinked: number;
  errors: string[];
};

export type GenreBestImportResult = {
  ok: boolean;
  dryRun: boolean;
  stats: GenreBestImportStats;
  message?: string;
  tableMissing?: boolean;
};

async function fetchWpJson<T>(url: string): Promise<{ ok: true; json: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'musicaichat-admin/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

function coverFromThumbnail(thumbnail: string | false | null | undefined): string | null {
  if (typeof thumbnail === 'string' && thumbnail.trim()) return thumbnail.trim();
  return null;
}

function lastUpdatedIso(unixSec: number | undefined): string | null {
  if (typeof unixSec !== 'number' || !Number.isFinite(unixSec) || unixSec <= 0) return null;
  return new Date(unixSec * 1000).toISOString();
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function loadStyleIdByName(admin: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await admin.from('catalog_styles').select('id, name, slug');
  if (!Array.isArray(data)) return map;
  for (const row of data as Array<{ id: string; name?: string; slug?: string }>) {
    if (row.name) map.set(normalizeStyleKey(row.name), row.id);
    if (row.slug) map.set(normalizeStyleKey(row.slug), row.id);
  }
  // common aliases
  if (!map.has(normalizeStyleKey('R&B'))) {
    const rb = [...map.entries()].find(([k]) => k === 'rb' || k === 'randb');
    if (rb) map.set(normalizeStyleKey('R&B'), rb[1]);
  }
  return map;
}

async function loadSongIdByMusic8Id(
  admin: SupabaseClient,
  wpSongIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = [...new Set(wpSongIds.filter((n) => Number.isFinite(n) && n > 0))];
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data } = await admin.from('songs').select('id, music8_song_id').in('music8_song_id', chunk);
    if (!Array.isArray(data)) continue;
    for (const row of data as Array<{ id: string; music8_song_id: number | null }>) {
      if (typeof row.music8_song_id === 'number') map.set(row.music8_song_id, row.id);
    }
  }
  return map;
}

function resolveStyleIds(
  styleNames: string[],
  styleIdByName: Map<string, string>,
): string[] {
  const ids: string[] = [];
  for (const name of styleNames) {
    const key = normalizeStyleKey(name);
    let id = styleIdByName.get(key);
    if (!id) {
      for (const [k, v] of styleIdByName) {
        if (styleKeysMatch(k, name) || styleKeysMatch(k, key)) {
          id = v;
          break;
        }
      }
    }
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * WP から Genre BEST（プレイリスト）を取り込み。
 * dryRun=true のときは DB 書き込みしない。
 */
export async function importGenreBestPlaylistsFromWp(
  admin: SupabaseClient,
  options: { apply?: boolean; limit?: number | null } = {},
): Promise<GenreBestImportResult> {
  const apply = options.apply === true;
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : null;

  const stats: GenreBestImportStats = {
    playlistsSeen: 0,
    playlistsUpserted: 0,
    songsLinked: 0,
    songsSkippedMissing: 0,
    stylesLinked: 0,
    errors: [],
  };

  if (!isMusic8WpRestEnabled()) {
    return {
      ok: false,
      dryRun: !apply,
      stats,
      message: 'Music8 WordPress REST が無効です（MUSIC8_WP_REST_BASE_URL）。',
    };
  }

  const base = getMusic8WpRestBaseUrl();
  if (!base) {
    return { ok: false, dryRun: !apply, stats, message: 'WP REST base URL がありません。' };
  }

  // table presence check
  const { error: probeErr } = await admin.from('catalog_playlists').select('id').limit(1);
  if (probeErr && isCatalogPlaylistTableMissingError(probeErr.message)) {
    return {
      ok: false,
      dryRun: !apply,
      stats,
      tableMissing: true,
      message:
        'catalog_playlists が未作成です。docs/sql/music8-catalog-extension.sql と catalog-playlists-cover-image.sql を実行してください。',
    };
  }

  const listRes = await fetchWpJson<WpPlaylistListItem[]>(`${base}/custom/v1/playlists`);
  if (!listRes.ok || !Array.isArray(listRes.json)) {
    return {
      ok: false,
      dryRun: !apply,
      stats,
      message: `プレイリスト一覧の取得に失敗しました（status ${!listRes.ok ? listRes.status : 'invalid'}）。`,
    };
  }

  let list = listRes.json.filter((p) => typeof p?.slug === 'string' && p.slug.trim());
  stats.playlistsSeen = list.length;
  if (limit != null) list = list.slice(0, limit);

  const styleIdByName = apply ? await loadStyleIdByName(admin) : new Map<string, string>();

  type DetailBundle = {
    listItem: WpPlaylistListItem;
    detail: WpPlaylistDetail | null;
    error?: string;
  };

  const bundles = await mapPool(list, DETAIL_CONCURRENCY, async (listItem): Promise<DetailBundle> => {
    const slug = String(listItem.slug).trim();
    const detailRes = await fetchWpJson<WpPlaylistDetail>(
      `${base}/custom/v1/playlist/${encodeURIComponent(slug)}`,
    );
    if (!detailRes.ok) {
      return {
        listItem,
        detail: null,
        error: `detail ${slug}: HTTP ${detailRes.status}`,
      };
    }
    return { listItem, detail: detailRes.json };
  });

  const allWpSongIds: number[] = [];
  for (const b of bundles) {
    for (const s of b.detail?.songs ?? []) {
      if (typeof s?.id === 'number' && Number.isFinite(s.id)) allWpSongIds.push(s.id);
    }
  }
  const songIdByMusic8 = apply ? await loadSongIdByMusic8Id(admin, allWpSongIds) : new Map();

  for (const b of bundles) {
    if (b.error) {
      stats.errors.push(b.error);
      continue;
    }
    const listItem = b.listItem;
    const detail = b.detail;
    const slug = String(listItem.slug).trim();
    const title = String(detail?.title || listItem.title || slug).trim() || slug;
    const description =
      typeof detail?.description === 'string'
        ? detail.description
        : typeof listItem.description === 'string'
          ? listItem.description
          : null;
    const cover =
      coverFromThumbnail(detail?.thumbnail) ?? coverFromThumbnail(listItem.thumbnail);
    const wpPostId =
      typeof detail?.id === 'number'
        ? detail.id
        : typeof listItem.id === 'number'
          ? listItem.id
          : null;
    const lastUpdated =
      lastUpdatedIso(listItem.last_updated) ?? new Date().toISOString();

    const styleNames: string[] = [];
    if (Array.isArray(listItem.styles)) {
      for (const s of listItem.styles) {
        if (typeof s === 'string' && s.trim()) styleNames.push(s.trim());
      }
    } else if (typeof listItem.style === 'string' && listItem.style.trim()) {
      styleNames.push(listItem.style.trim());
    }

    const wpSongs = Array.isArray(detail?.songs) ? detail!.songs! : [];
    const linkedSongIds: string[] = [];
    for (const s of wpSongs) {
      const wpId = typeof s?.id === 'number' ? s.id : null;
      if (wpId == null) {
        stats.songsSkippedMissing += 1;
        continue;
      }
      if (!apply) {
        // dry-run: can't know missing without lookup — still count as potential
        linkedSongIds.push(`wp:${wpId}`);
        continue;
      }
      const songId = songIdByMusic8.get(wpId);
      if (!songId) {
        stats.songsSkippedMissing += 1;
        continue;
      }
      if (!linkedSongIds.includes(songId)) linkedSongIds.push(songId);
    }

    if (!apply) {
      stats.playlistsUpserted += 1;
      stats.songsLinked += linkedSongIds.length;
      stats.stylesLinked += styleNames.length;
      continue;
    }

    // find existing by wp_post_id or slug
    let existingId: string | null = null;
    if (wpPostId != null) {
      const { data } = await admin
        .from('catalog_playlists')
        .select('id')
        .eq('wp_post_id', wpPostId)
        .maybeSingle();
      if (data?.id) existingId = data.id as string;
    }
    if (!existingId) {
      const { data } = await admin
        .from('catalog_playlists')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (data?.id) existingId = data.id as string;
    }

    const payload = {
      slug,
      title,
      description: description?.trim() || null,
      wp_post_id: wpPostId,
      cover_image_url: cover,
      last_song_updated_at: lastUpdated,
      updated_at: new Date().toISOString(),
    };

    let playlistId = existingId;
    if (existingId) {
      const { error } = await admin.from('catalog_playlists').update(payload).eq('id', existingId);
      if (error) {
        stats.errors.push(`upsert ${slug}: ${error.message}`);
        continue;
      }
    } else {
      const { data, error } = await admin
        .from('catalog_playlists')
        .insert(payload)
        .select('id')
        .single();
      if (error || !data?.id) {
        stats.errors.push(`insert ${slug}: ${error?.message ?? 'no id'}`);
        continue;
      }
      playlistId = data.id as string;
    }

    stats.playlistsUpserted += 1;

    // replace styles
    await admin.from('catalog_playlist_styles').delete().eq('playlist_id', playlistId!);
    const styleIds = resolveStyleIds(styleNames, styleIdByName);
    if (styleIds.length > 0) {
      const { error: stErr } = await admin.from('catalog_playlist_styles').insert(
        styleIds.map((style_id) => ({ playlist_id: playlistId!, style_id })),
      );
      if (stErr) stats.errors.push(`styles ${slug}: ${stErr.message}`);
      else stats.stylesLinked += styleIds.length;
    }

    // replace songs
    await admin.from('catalog_playlist_songs').delete().eq('playlist_id', playlistId!);
    if (linkedSongIds.length > 0) {
      const rows = linkedSongIds.map((song_id, position) => ({
        playlist_id: playlistId!,
        song_id,
        position,
      }));
      const { error: songErr } = await admin.from('catalog_playlist_songs').insert(rows);
      if (songErr) stats.errors.push(`songs ${slug}: ${songErr.message}`);
      else stats.songsLinked += linkedSongIds.length;
    }
  }

  // dry-run: refine missing song estimate with one lookup
  if (!apply && allWpSongIds.length > 0) {
    const map = await loadSongIdByMusic8Id(admin, allWpSongIds);
    let linked = 0;
    let missing = 0;
    const seen = new Set<number>();
    for (const b of bundles) {
      for (const s of b.detail?.songs ?? []) {
        const wpId = typeof s?.id === 'number' ? s.id : null;
        if (wpId == null || seen.has(wpId)) continue;
        seen.add(wpId);
        if (map.has(wpId)) linked += 1;
        else missing += 1;
      }
    }
    // recount unique across playlists for report — use per-playlist linkedSongIds length already;
    // overwrite skipped with unique estimate for clarity in CLI
    stats.songsSkippedMissing = missing;
    // songsLinked already counted per-playlist slot in dry-run; keep that
    void linked;
  }

  return {
    ok: stats.errors.length === 0,
    dryRun: !apply,
    stats,
    message: apply
      ? `取込完了: PL ${stats.playlistsUpserted}/${list.length}・曲リンク ${stats.songsLinked}・未登録スキップ ${stats.songsSkippedMissing}`
      : `dry-run: PL ${list.length}（全体 ${stats.playlistsSeen}）・曲スロット見積 ${stats.songsLinked}・未登録曲 ID ${stats.songsSkippedMissing}`,
  };
}
