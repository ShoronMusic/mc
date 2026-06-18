import fs from 'node:fs';
import path from 'node:path';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-fetch';
import { music8ArtistSongsListJsonUrl, music8SongJsonUrl } from '@/lib/music8-data-urls';
import { songTitleToMusic8Slug } from '@/lib/music8-song-lookup';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import { fetchMusic8SongFromWpRest, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';
import {
  buildMusic8WpSongsVideoIndexFromLocalDir,
  extractYoutubeVideoIdFromWpSongJson,
  loadMusic8WpSongsVideoIndexFromFile,
  saveMusic8WpSongsVideoIndexToFile,
  type Music8WpSongsVideoIndex,
} from '@/lib/music8-wp-songs-video-index';

export type Music8SongRowForJsonResolve = {
  main_artist: string | null;
  song_title: string | null;
  display_title?: string | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
  music8_video_id?: string | null;
  music8_song_id?: number | null;
  spotify_artists?: string | null;
  music8_song_data?: unknown;
};

export type ResolveMusic8WpSongJsonOptions = {
  videoId?: string | null;
  songsLocalDir?: string | null;
  artistsLocalDir?: string | null;
  videoIndex?: Music8WpSongsVideoIndex | null;
  /** slug 失敗時に video 索引・slug 走査・`{artist}_songs.json` 照合を行う */
  videoIdFallback?: boolean;
  /** `music8_song_id` があるとき WP REST で曲 JSON を取得 */
  wpRestFallback?: boolean;
};

export type ResolvedMusic8WpSongJson = {
  json: Record<string, unknown>;
  canonicalArtistSlug: string;
  songSlug: string;
  resolvedVia: 'slug' | 'video-index' | 'video-slug-scan' | 'artist-songs-list' | 'wp-rest';
};

type ArtistSongsListRow = {
  slug?: unknown;
  ytvideoid?: unknown;
  spotify_artists?: unknown;
  acf?: { ytvideoid?: unknown } | null;
};

type ArtistSongsJson = {
  songs?: ArtistSongsListRow[];
};

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function resolveMusic8Slugs(
  row: Music8SongRowForJsonResolve,
): { artistSlug: string; songSlug: string } | null {
  const fromCols = (row.music8_artist_slug ?? '').trim();
  const fromSong = (row.music8_song_slug ?? '').trim();
  if (fromCols && fromSong) return { artistSlug: fromCols, songSlug: fromSong };

  const data = row.music8_song_data;
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const sk = (data as Record<string, unknown>).stable_key;
    if (sk != null && typeof sk === 'object' && !Array.isArray(sk)) {
      const o = sk as Record<string, unknown>;
      const artistSlug = typeof o.artist_slug === 'string' ? o.artist_slug.trim() : '';
      const songSlug = typeof o.song_slug === 'string' ? o.song_slug.trim() : '';
      if (artistSlug && songSlug) return { artistSlug, songSlug };
    }
  }

  const ma = (row.main_artist ?? '').trim();
  const st = (row.song_title ?? '').trim();
  if (ma && st) {
    const artistSlug = artistNameToMusic8Slug(ma);
    const songSlug = songTitleToMusic8Slug(st);
    if (artistSlug && songSlug) return { artistSlug, songSlug };
  }
  return null;
}

function spotifyArtistsFromRow(row: Music8SongRowForJsonResolve): string | null {
  const top = (row.spotify_artists ?? '').trim();
  if (top) return top;
  const data = row.music8_song_data;
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const fromSnap = typeof o.spotify_artists === 'string' ? o.spotify_artists.trim() : '';
    if (fromSnap) return fromSnap;
  }
  return null;
}

function normalizeArtistNameToMusic8Slug(name: string): string {
  let s = name.trim();
  if (!s) return '';
  s = s.replace(/^\s*(?:The|A|An)\s+/i, '').trim();
  const commaIndex = s.indexOf(',');
  if (commaIndex >= 0) s = s.slice(0, commaIndex).trim();
  s = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s;
}

/** `Macklemore & Ryan Lewis` のように & 付きグループ名をそのまま slug 化 */
export function artistDuoNameToMusic8Slug(artistName: string): string {
  const trimmed = (artistName ?? '').trim();
  if (!trimmed || !/\s&\s/.test(trimmed)) return '';
  return normalizeArtistNameToMusic8Slug(trimmed);
}

function addArtistSlugCandidates(out: string[], name: string): void {
  const add = (slug: string | null | undefined) => {
    const a = (slug ?? '').trim().toLowerCase();
    if (!a || out.includes(a)) return;
    out.push(a);
  };
  add(artistNameToMusic8Slug(name));
  add(artistDuoNameToMusic8Slug(name));
}

/** `{artist}_songs.json` 走査用のアーティスト slug 候補（song slug 不要） */
export function collectArtistSlugsForRow(row: Music8SongRowForJsonResolve): string[] {
  const out: string[] = [];
  const add = (slug: string | null | undefined) => {
    const a = (slug ?? '').trim().toLowerCase();
    if (!a || out.includes(a)) return;
    out.push(a);
  };

  add(row.music8_artist_slug);
  const resolved = resolveMusic8Slugs(row);
  if (resolved?.artistSlug) add(resolved.artistSlug);

  let names = parseSpotifyArtistsString(spotifyArtistsFromRow(row));
  if (names.length === 0 && row.main_artist) {
    names = parseCollabArtistNamesFromMainArtist(row.main_artist);
  }
  for (const name of names) {
    addArtistSlugCandidates(out, name);
  }

  return out;
}

/** slug 候補（DB 列・spotify 順・main_artist 分解） */
export function collectSlugPairsForRow(
  row: Music8SongRowForJsonResolve,
): { artistSlug: string; songSlug: string }[] {
  const resolved = resolveMusic8Slugs(row);
  const songSlug = (row.music8_song_slug ?? resolved?.songSlug ?? '').trim().toLowerCase();
  const out: { artistSlug: string; songSlug: string }[] = [];
  const add = (artistSlug: string) => {
    const a = artistSlug.trim().toLowerCase();
    if (!a || !songSlug) return;
    if (!out.some((p) => p.artistSlug === a && p.songSlug === songSlug)) {
      out.push({ artistSlug: a, songSlug });
    }
  };

  if (row.music8_artist_slug) add(row.music8_artist_slug);
  if (resolved?.artistSlug) add(resolved.artistSlug);

  let names = parseSpotifyArtistsString(spotifyArtistsFromRow(row));
  if (names.length === 0 && row.main_artist) {
    names = parseCollabArtistNamesFromMainArtist(row.main_artist);
  }
  for (const name of names) {
    for (const slug of [artistNameToMusic8Slug(name), artistDuoNameToMusic8Slug(name)]) {
      if (slug) add(slug);
    }
  }

  return out;
}

export function extractYoutubeVideoIdFromArtistSongsListRow(row: ArtistSongsListRow): string | null {
  const top = asString(row.ytvideoid);
  if (YT_ID_RE.test(top)) return top;
  const fromAcf = asString(row.acf?.ytvideoid);
  if (YT_ID_RE.test(fromAcf)) return fromAcf;
  return null;
}

export function findArtistSongsListRowByVideoId(
  rows: ArtistSongsListRow[],
  videoId: string,
): ArtistSongsListRow | null {
  const vid = videoId.trim();
  if (!YT_ID_RE.test(vid)) return null;
  for (const row of rows) {
    const found = extractYoutubeVideoIdFromArtistSongsListRow(row);
    if (found === vid) return row;
  }
  return null;
}

export function slugMatchesMusic8SongSlug(target: string, candidate: string): boolean {
  const t = target.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!t || !c) return false;
  if (t === c) return true;
  if (c.startsWith(`${t}-`)) return true;
  if (t.startsWith(`${c}-`)) return true;
  return false;
}

/** `[Official HD …]` 等の括弧付きメタを除いた曲名 */
export function stripBracketedMetadataFromSongTitle(title: string): string {
  return title.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function addSongTitleSlugHints(
  add: (raw: string | null | undefined) => void,
  title: string,
): void {
  const cleaned = stripBracketedMetadataFromSongTitle(title);
  if (!cleaned) return;
  add(songTitleToMusic8Slug(cleaned));
  const parts = cleaned.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    add(songTitleToMusic8Slug(parts[parts.length - 1]!));
  }
}

/** artist list 照合用の song slug 候補 */
export function collectSongSlugHintsForRow(row: Music8SongRowForJsonResolve): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? '').trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };

  if (row.music8_song_slug) add(row.music8_song_slug);

  const resolved = resolveMusic8Slugs(row);
  if (resolved?.songSlug) add(resolved.songSlug);

  const mainArtist = (row.main_artist ?? '').trim();
  if (mainArtist) add(artistNameToMusic8Slug(mainArtist));

  const songTitle = (row.song_title ?? '').trim();
  if (songTitle) {
    addSongTitleSlugHints(add, songTitle);
  }

  const displayTitle = (row.display_title ?? '').trim();
  if (displayTitle) {
    const segs = displayTitle.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    if (segs.length === 2) {
      const left = segs[0]!;
      const main = (row.main_artist ?? '').trim();
      if (main && main.localeCompare(left, undefined, { sensitivity: 'accent' }) === 0) {
        addSongTitleSlugHints(add, left);
      }
    } else {
      addSongTitleSlugHints(add, displayTitle);
    }
  }

  return out;
}

export function findArtistSongsListRowBySongSlug(
  rows: ArtistSongsListRow[],
  songSlugHint: string,
): ArtistSongsListRow | null {
  const t = songSlugHint.trim().toLowerCase();
  if (!t) return null;
  const exact = rows.find((r) => asString(r.slug).toLowerCase() === t);
  if (exact) return exact;
  return (
    rows.find((r) => {
      const raw = asString(r.slug);
      return raw ? slugMatchesMusic8SongSlug(t, raw) : false;
    }) ?? null
  );
}

export function findArtistSongsListRowBySongSlugHints(
  rows: ArtistSongsListRow[],
  hints: string[],
): ArtistSongsListRow | null {
  for (const hint of hints) {
    const hit = findArtistSongsListRowBySongSlug(rows, hint);
    if (hit) return hit;
  }
  return null;
}

async function tryResolveFromArtistSongsListRow(
  hit: ArtistSongsListRow,
  listArtistSlug: string,
  options: ResolveMusic8WpSongJsonOptions,
  dbVideoId: string | null,
): Promise<ResolvedMusic8WpSongJson | null> {
  const songSlug = asString(hit.slug).toLowerCase();
  if (!songSlug) return null;

  const canonicalArtistSlug = canonicalArtistSlugFromArtistSongsListRow(hit, listArtistSlug);
  const json = await fetchWpSongsFileJson(canonicalArtistSlug, songSlug, options.songsLocalDir);
  if (!json) return null;

  const listVid = extractYoutubeVideoIdFromArtistSongsListRow(hit);
  const jsonVid = extractYoutubeVideoIdFromWpSongJson(json);
  if (dbVideoId && listVid && listVid !== dbVideoId) {
    // DB の video_id が誤っているときは list / 曲 JSON の一致を優先
    if (!jsonVid || jsonVid !== listVid) return null;
  } else if (dbVideoId && !acceptJsonForVideo(json, dbVideoId)) {
    return null;
  }

  return {
    json,
    canonicalArtistSlug,
    songSlug,
    resolvedVia: 'artist-songs-list',
  };
}

/** リスト行の spotify 先頭から canonical artist slug を決める */
export function canonicalArtistSlugFromArtistSongsListRow(
  listRow: ArtistSongsListRow,
  listArtistSlug: string,
): string {
  const spotify = asString(listRow.spotify_artists);
  if (spotify) {
    const first = spotify.split(',')[0]?.trim();
    const slug = first ? artistNameToMusic8Slug(first) : null;
    if (slug) return slug;
  }
  return listArtistSlug.trim().toLowerCase();
}

function readLocalJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readLocalSongJson(
  localDir: string,
  artistSlug: string,
  songSlug: string,
): Record<string, unknown> | null {
  const base = path.resolve(localDir);
  return readLocalJsonFile(path.join(base, `${artistSlug}_${songSlug}.json`));
}

function readLocalArtistSongsListJson(
  localDir: string,
  artistSlug: string,
): ArtistSongsJson | null {
  const base = path.resolve(localDir);
  const slug = artistSlug.trim();
  for (const suffix of ['_songs.json', '_spngs.json']) {
    const parsed = readLocalJsonFile(path.join(base, `${slug}${suffix}`));
    if (parsed) return parsed as ArtistSongsJson;
  }
  return null;
}

async function fetchArtistSongsListJsonRemote(artistSlug: string): Promise<ArtistSongsJson | null> {
  const slug = artistSlug.trim();
  const primary = await fetchJsonWithOptionalGcsAuth<ArtistSongsJson>(music8ArtistSongsListJsonUrl(slug));
  if (primary?.songs?.length) return primary;
  const typoUrl = `${music8ArtistSongsListJsonUrl(slug).replace(/_songs\.json$/, '_spngs.json')}`;
  const typo = await fetchJsonWithOptionalGcsAuth<ArtistSongsJson>(typoUrl);
  return typo ?? primary;
}

async function fetchWpSongsFileJson(
  artistSlug: string,
  songSlug: string,
  songsLocalDir: string | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (songsLocalDir) {
    const local = readLocalSongJson(songsLocalDir, artistSlug, songSlug);
    if (local) return local;
  }
  const url = music8SongJsonUrl(artistSlug, songSlug);
  const remote = await fetchJsonWithOptionalGcsAuth<Record<string, unknown>>(url);
  return remote ?? null;
}

async function fetchArtistSongsListJson(
  artistSlug: string,
  artistsLocalDir: string | null | undefined,
): Promise<ArtistSongsJson | null> {
  if (artistsLocalDir) {
    const local = readLocalArtistSongsListJson(artistsLocalDir, artistSlug);
    if (local) return local;
  }
  return fetchArtistSongsListJsonRemote(artistSlug);
}

function resolveVideoId(
  row: Music8SongRowForJsonResolve,
  videoId: string | null | undefined,
): string | null {
  const fromArg = (videoId ?? '').trim();
  if (YT_ID_RE.test(fromArg)) return fromArg;
  const fromCol = (row.music8_video_id ?? '').trim();
  if (YT_ID_RE.test(fromCol)) return fromCol;
  return null;
}

function acceptJsonForVideo(
  json: Record<string, unknown>,
  videoId: string | null,
): boolean {
  if (!videoId) return true;
  const found = extractYoutubeVideoIdFromWpSongJson(json);
  return !found || found === videoId;
}

async function resolveViaArtistSongsList(
  row: Music8SongRowForJsonResolve,
  dbVideoId: string | null,
  options: ResolveMusic8WpSongJsonOptions,
): Promise<ResolvedMusic8WpSongJson | null> {
  const artistSlugs = collectArtistSlugsForRow(row);
  const slugHints = collectSongSlugHintsForRow(row);

  if (dbVideoId) {
    for (const listArtistSlug of artistSlugs) {
      const listJson = await fetchArtistSongsListJson(listArtistSlug, options.artistsLocalDir);
      const rows = Array.isArray(listJson?.songs) ? listJson!.songs! : [];
      const hit = findArtistSongsListRowByVideoId(rows, dbVideoId);
      if (!hit) continue;
      const resolved = await tryResolveFromArtistSongsListRow(hit, listArtistSlug, options, dbVideoId);
      if (resolved) return resolved;
    }
  }

  for (const listArtistSlug of artistSlugs) {
    const listJson = await fetchArtistSongsListJson(listArtistSlug, options.artistsLocalDir);
    const rows = Array.isArray(listJson?.songs) ? listJson!.songs! : [];
    const hit = findArtistSongsListRowBySongSlugHints(rows, slugHints);
    if (!hit) continue;
    const resolved = await tryResolveFromArtistSongsListRow(hit, listArtistSlug, options, dbVideoId);
    if (resolved) return resolved;
  }

  return null;
}

async function resolveViaWpRest(
  row: Music8SongRowForJsonResolve,
): Promise<ResolvedMusic8WpSongJson | null> {
  if (!isMusic8WpRestEnabled()) return null;
  const wpId = row.music8_song_id;
  if (typeof wpId !== 'number' || !Number.isFinite(wpId) || wpId <= 0) return null;

  const artistLookup = (row.main_artist ?? '').trim();
  const songLookupTitle = (row.song_title ?? '').trim();
  if (!artistLookup || !songLookupTitle) return null;

  const json = await fetchMusic8SongFromWpRest({
    artistLookup,
    songLookupTitle,
    videoId: null,
    music8SongId: Math.floor(wpId),
  });
  if (!json) return null;

  const songSlug =
    asString(json.slug).toLowerCase() || (row.music8_song_slug ?? '').trim().toLowerCase();
  const artists = Array.isArray(json.artists) ? json.artists : [];
  const firstArtist = artists[0];
  const fromArtist =
    firstArtist != null && typeof firstArtist === 'object' && !Array.isArray(firstArtist)
      ? asString((firstArtist as Record<string, unknown>).slug).toLowerCase()
      : '';
  const canonicalArtistSlug =
    fromArtist ||
    (row.music8_artist_slug ?? '').trim().toLowerCase() ||
    artistNameToMusic8Slug(artistLookup);
  if (!songSlug || !canonicalArtistSlug) return null;

  return {
    json,
    canonicalArtistSlug,
    songSlug,
    resolvedVia: 'wp-rest',
  };
}

/**
 * Music8 WP 曲 JSON を解決（slug → video 索引 → slug 走査 → `{artist}_songs.json` → WP REST）。
 */
export async function resolveMusic8WpSongJsonForRow(
  row: Music8SongRowForJsonResolve,
  options: ResolveMusic8WpSongJsonOptions = {},
): Promise<ResolvedMusic8WpSongJson | null> {
  const videoId = resolveVideoId(row, options.videoId);
  const pairs = collectSlugPairsForRow(row);

  for (const pair of pairs) {
    const json = await fetchWpSongsFileJson(pair.artistSlug, pair.songSlug, options.songsLocalDir);
    if (!json || !acceptJsonForVideo(json, videoId)) continue;
    return {
      json,
      canonicalArtistSlug: pair.artistSlug,
      songSlug: pair.songSlug,
      resolvedVia: 'slug',
    };
  }

  if (!options.videoIdFallback) return null;

  if (videoId) {
    const videoIndex = options.videoIndex;
    if (videoIndex && videoIndex.size > 0) {
      const hit = videoIndex.get(videoId);
      if (hit) {
        const json = await fetchWpSongsFileJson(hit.artistSlug, hit.songSlug, options.songsLocalDir);
        if (json && acceptJsonForVideo(json, videoId)) {
          return {
            json,
            canonicalArtistSlug: hit.artistSlug,
            songSlug: hit.songSlug,
            resolvedVia: 'video-index',
          };
        }
      }
    }

    for (const pair of pairs) {
      const json = await fetchWpSongsFileJson(pair.artistSlug, pair.songSlug, options.songsLocalDir);
      if (!json) continue;
      const found = extractYoutubeVideoIdFromWpSongJson(json);
      if (found && found === videoId) {
        return {
          json,
          canonicalArtistSlug: pair.artistSlug,
          songSlug: pair.songSlug,
          resolvedVia: 'video-slug-scan',
        };
      }
    }
  }

  const viaList = await resolveViaArtistSongsList(row, videoId, options);
  if (viaList) return viaList;

  if (options.wpRestFallback !== false) {
    const viaWp = await resolveViaWpRest(row);
    if (viaWp) return viaWp;
  }

  return null;
}

export type LoadMusic8VideoIndexOptions = {
  videoIndexIn?: string | null;
  songsLocalDir?: string | null;
  videoIndexOut?: string | null;
  onBuildProgress?: (info: { scanned: number; indexed: number; conflicts: number }) => void;
};

export async function loadMusic8WpSongsVideoIndexForScripts(
  opts: LoadMusic8VideoIndexOptions,
): Promise<Music8WpSongsVideoIndex | null> {
  if (opts.videoIndexIn) {
    const index = loadMusic8WpSongsVideoIndexFromFile(opts.videoIndexIn);
    console.log(`[music8-video-index] loaded: ${index.size} entries (${opts.videoIndexIn})`);
    return index;
  }
  if (opts.songsLocalDir) {
    console.log(`[music8-video-index] building from ${opts.songsLocalDir} …`);
    const index = buildMusic8WpSongsVideoIndexFromLocalDir(opts.songsLocalDir, {
      progressEvery: 2000,
      onProgress: opts.onBuildProgress,
    });
    console.log(`[music8-video-index] built: ${index.size} entries`);
    if (opts.videoIndexOut) {
      saveMusic8WpSongsVideoIndexToFile(opts.videoIndexOut, index);
      console.log(`[music8-video-index] saved: ${path.resolve(opts.videoIndexOut)}`);
    }
    return index;
  }
  return null;
}
