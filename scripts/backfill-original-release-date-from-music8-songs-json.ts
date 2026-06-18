/**
 * `data/songs/{artist}_{slug}.json` の `releaseDate` で `songs.original_release_date` を上書きする。
 * YouTube / Spotify / musicaichat の誤った日付が入った行の原盤日補正用。
 *
 * Usage:
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --apply
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --artist-slug=oasis --apply
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --limit=50 --sleep-ms=40
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --songs-local-dir=C:\Users\maeha\json\data\songs
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --video-id-fallback --songs-local-dir=C:\Users\maeha\json\data\songs --apply
 *   npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts --video-id-fallback --video-index-in=tmp/music8-wp-songs-video-index.json --apply
 *
 * slug で JSON が見つからない行は `--video-id-fallback` 時に video_id + slug 候補で再取得。
 * 索引（`--songs-local-dir` / `--video-index-in`）が無くても GCS へ slug 候補照合できる。
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * GCS 認証失敗時は公開 HTTP GET にフォールバック（`GOOGLE_APPLICATION_CREDENTIALS_JSON` 任意）
 */
import fs from 'node:fs';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { songTitleToMusic8Slug } from '@/lib/music8-song-lookup';
import { resolveOriginalReleaseDateFromMusic8WpSongsFileJson } from '@/lib/music8-song-fields';
import { music8SongJsonUrl, resolveMusic8SongsBaseUrl } from '@/lib/music8-data-urls';
import {
  buildMusic8WpSongsVideoIndexFromLocalDir,
  loadMusic8WpSongsVideoIndexFromFile,
  saveMusic8WpSongsVideoIndexToFile,
  type Music8WpSongsVideoIndex,
} from '@/lib/music8-wp-songs-video-index';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import { extractYoutubeVideoIdFromWpSongJson } from '@/lib/music8-wp-songs-video-index';

const PAGE = 500;
const HTTP_TIMEOUT_MS = 25_000;

type SongRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
  music8_video_id: string | null;
  spotify_artists: string | null;
  original_release_date: string | null;
  music8_song_data?: unknown;
};

type CliOptions = {
  apply: boolean;
  artistSlug: string | null;
  limit: number | null;
  sleepMs: number;
  songsLocalDir: string | null;
  progressEvery: number;
  notFoundOut: string | null;
  videoIdFallback: boolean;
  videoIndexIn: string | null;
  videoIndexOut: string | null;
  idsFromCsv: string | null;
  help: boolean;
};

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
  }
  const limitRaw = args.get('limit');
  const limitNum = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
  const sleepRaw = args.get('sleep-ms');
  const sleepNum = sleepRaw ? Number.parseInt(sleepRaw, 10) : 30;
  const progressRaw = args.get('progress-every');
  const progressNum = progressRaw ? Number.parseInt(progressRaw, 10) : 50;
  return {
    apply: argv.includes('--apply'),
    artistSlug: args.get('artist-slug')?.trim() || null,
    limit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : null,
    sleepMs: Number.isFinite(sleepNum) && sleepNum >= 0 ? sleepNum : 30,
    songsLocalDir: args.get('songs-local-dir')?.trim() || null,
    progressEvery: Number.isFinite(progressNum) && progressNum > 0 ? progressNum : 50,
    notFoundOut: args.get('not-found-out')?.trim() || null,
    videoIdFallback: argv.includes('--video-id-fallback'),
    videoIndexIn: args.get('video-index-in')?.trim() || null,
    videoIndexOut: args.get('video-index-out')?.trim() || null,
    idsFromCsv: args.get('ids-from-csv')?.trim() || null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normDateKey(iso: string | null | undefined): string | null {
  const s = (iso ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function resolveMusic8Slugs(row: SongRow): { artistSlug: string; songSlug: string } | null {
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

type GcsObjectRef = { bucket: string; objectPath: string };

function readServiceAccountFromEnv(): { client_email: string; private_key: string; project_id?: string } | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      ...(parsed.project_id ? { project_id: parsed.project_id } : {}),
    };
  } catch {
    return null;
  }
}

let storageClient: Storage | null = null;

function getStorageClient(): Storage {
  if (storageClient) return storageClient;
  const envCredentials = readServiceAccountFromEnv();
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || envCredentials?.project_id?.trim() || undefined;
  storageClient = new Storage({
    ...(projectId ? { projectId } : {}),
    ...(envCredentials
      ? {
          credentials: {
            client_email: envCredentials.client_email,
            private_key: envCredentials.private_key,
          },
        }
      : {}),
  });
  return storageClient;
}

function parseGcsUrl(url: string): GcsObjectRef | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'storage.googleapis.com') return null;
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const slash = pathname.indexOf('/');
    if (slash <= 0) return null;
    const bucket = pathname.slice(0, slash).trim();
    const objectPath = decodeURIComponent(pathname.slice(slash + 1)).trim();
    if (!bucket || !objectPath) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

async function fetchHttpJsonWithTimeout<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithOptionalGcsAuth<T>(url: string): Promise<T | null> {
  const gcs = parseGcsUrl(url);
  if (gcs) {
    try {
      const [buffer] = await getStorageClient().bucket(gcs.bucket).file(gcs.objectPath).download();
      return JSON.parse(buffer.toString('utf-8')) as T;
    } catch {
      // 認証失敗時は公開 GET へフォールバック
    }
  }
  return fetchHttpJsonWithTimeout<T>(url);
}

function readLocalSongJson(
  localDir: string,
  artistSlug: string,
  songSlug: string,
): Record<string, unknown> | null {
  const base = path.resolve(localDir);
  const filePath = path.join(base, `${artistSlug}_${songSlug}.json`);
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

async function fetchWpSongsFileJson(
  artistSlug: string,
  songSlug: string,
  songsLocalDir: string | null,
): Promise<Record<string, unknown> | null> {
  if (songsLocalDir) {
    const local = readLocalSongJson(songsLocalDir, artistSlug, songSlug);
    if (local) return local;
  }
  const url = music8SongJsonUrl(artistSlug, songSlug);
  const remote = await fetchJsonWithOptionalGcsAuth<Record<string, unknown>>(url);
  return remote ?? null;
}

function rankSongVideoVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

function readSongIdsFromCsv(csvPath: string): Set<string> {
  const abs = path.resolve(csvPath);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(Boolean);
  const ids = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.toLowerCase().startsWith('id,')) continue;
    const id = line.split(',')[0]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function fetchRepresentativeVideoIdBySongId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(songIds.map((x) => x.trim()).filter(Boolean))];
  const chunkSize = 150;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('song_videos')
      .select('song_id, video_id, variant, created_at')
      .in('song_id', chunk);
    if (error) {
      if (error.code === '42703' || error.code === '42P01') return out;
      throw new Error(`${error.code ?? ''} ${error.message}`);
    }
    const best = new Map<string, { videoId: string; rank: number; createdAt: string }>();
    for (const row of data ?? []) {
      const cast = row as { song_id?: string; video_id?: string; variant?: string | null; created_at?: string };
      const songId = (cast.song_id ?? '').trim();
      const videoId = (cast.video_id ?? '').trim();
      if (!songId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
      const rank = rankSongVideoVariant(cast.variant);
      const createdAt = (cast.created_at ?? '').trim();
      const cur = best.get(songId);
      if (!cur || rank < cur.rank || (rank === cur.rank && createdAt > cur.createdAt)) {
        best.set(songId, { videoId, rank, createdAt });
      }
    }
    for (const [songId, v] of best) out.set(songId, v.videoId);
  }
  return out;
}

function resolveVideoIdForSong(row: SongRow, videoBySongId: Map<string, string>): string | null {
  const fromCol = (row.music8_video_id ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(fromCol)) return fromCol;
  return videoBySongId.get(row.id) ?? null;
}

function spotifyArtistsFromRow(row: SongRow): string | null {
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

function collectSlugPairsForRow(
  row: SongRow,
  slugs: { artistSlug: string; songSlug: string },
): { artistSlug: string; songSlug: string }[] {
  const songSlug = (row.music8_song_slug ?? slugs.songSlug).trim().toLowerCase();
  const out: { artistSlug: string; songSlug: string }[] = [];
  const add = (artistSlug: string) => {
    const a = artistSlug.trim().toLowerCase();
    if (!a || !songSlug) return;
    if (!out.some((p) => p.artistSlug === a && p.songSlug === songSlug)) {
      out.push({ artistSlug: a, songSlug });
    }
  };

  if (row.music8_artist_slug) add(row.music8_artist_slug);
  add(slugs.artistSlug);

  let names = parseSpotifyArtistsString(spotifyArtistsFromRow(row));
  if (names.length === 0 && row.main_artist) {
    names = parseCollabArtistNamesFromMainArtist(row.main_artist);
  }
  for (const name of names) {
    const slug = artistNameToMusic8Slug(name);
    if (slug) add(slug);
  }

  return out;
}

async function tryResolveJsonByVideoFallback(
  row: SongRow,
  slugs: { artistSlug: string; songSlug: string },
  videoBySongId: Map<string, string>,
  songsLocalDir: string | null,
): Promise<{ json: Record<string, unknown>; effectiveSlugs: { artistSlug: string; songSlug: string } } | null> {
  const videoId = resolveVideoIdForSong(row, videoBySongId);
  if (!videoId) return null;

  for (const pair of collectSlugPairsForRow(row, slugs)) {
    const json = await fetchWpSongsFileJson(pair.artistSlug, pair.songSlug, songsLocalDir);
    if (!json) continue;
    const vid = extractYoutubeVideoIdFromWpSongJson(json);
    if (vid && vid !== videoId) continue;
    return { json, effectiveSlugs: pair };
  }

  return null;
}

async function loadVideoIndex(opts: CliOptions): Promise<Music8WpSongsVideoIndex | null> {
  if (!opts.videoIdFallback) return null;
  if (opts.videoIndexIn) {
    const index = loadMusic8WpSongsVideoIndexFromFile(opts.videoIndexIn);
    console.log(`[backfill-release] video index loaded: ${index.size} entries (${opts.videoIndexIn})`);
    return index;
  }
  if (opts.songsLocalDir) {
    console.log(`[backfill-release] building video index from ${opts.songsLocalDir} …`);
    const index = buildMusic8WpSongsVideoIndexFromLocalDir(opts.songsLocalDir, {
      progressEvery: 2000,
      onProgress: ({ scanned, indexed, conflicts }) => {
        console.log(`[video-index] scanned=${scanned} indexed=${indexed} conflicts=${conflicts}`);
      },
    });
    console.log(`[backfill-release] video index built: ${index.size} entries`);
    if (opts.videoIndexOut) {
      saveMusic8WpSongsVideoIndexToFile(opts.videoIndexOut, index);
      console.log(`[backfill-release] video index saved: ${path.resolve(opts.videoIndexOut)}`);
    }
    return index;
  }
  return null;
}

async function fetchSongsByIds(ids: Set<string>): Promise<SongRow[]> {
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');
  const all: SongRow[] = [];
  const idList = [...ids];
  const chunkSize = 150;
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('songs')
      .select(
        'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, music8_video_id, spotify_artists, original_release_date, music8_song_data',
      )
      .in('id', chunk);
    if (error) {
      if (error.code === '42703' && error.message.includes('music8_video_id')) {
        const { data: data2, error: error2 } = await admin
          .from('songs')
          .select(
            'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, spotify_artists, original_release_date, music8_song_data',
          )
          .in('id', chunk);
        if (error2) throw new Error(`${error2.code ?? ''} ${error2.message}`);
        all.push(...((data2 ?? []) as SongRow[]));
        continue;
      }
      throw new Error(`${error.code ?? ''} ${error.message}`);
    }
    all.push(...((data ?? []) as SongRow[]));
  }
  return all;
}

async function fetchAllSongs(artistSlugFilter: string | null, idsFilter: Set<string> | null): Promise<SongRow[]> {
  if (idsFilter && idsFilter.size > 0) {
    return fetchSongsByIds(idsFilter);
  }
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');
  const all: SongRow[] = [];
  let from = 0;

  for (;;) {
    let q = admin
      .from('songs')
      .select(
        'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, music8_video_id, spotify_artists, original_release_date, music8_song_data',
      )
      .order('display_title', { ascending: true });

    if (artistSlugFilter) {
      q = q.eq('music8_artist_slug', artistSlugFilter);
    }

    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42703' && error.message.includes('music8_video_id')) {
        let q2 = admin
          .from('songs')
          .select(
            'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, spotify_artists, original_release_date, music8_song_data',
          )
          .order('display_title', { ascending: true });
        if (artistSlugFilter) q2 = q2.eq('music8_artist_slug', artistSlugFilter);
        const res2 = await q2.range(from, from + PAGE - 1);
        if (res2.error) throw new Error(`${res2.error.code ?? ''} ${res2.error.message}`);
        const batch2 = (res2.data ?? []) as SongRow[];
        all.push(...batch2);
        if (batch2.length < PAGE) break;
        from += PAGE;
        continue;
      }
      throw new Error(`${error.code ?? ''} ${error.message}`);
    }
    const batch = (data ?? []) as SongRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npx tsx scripts/backfill-original-release-date-from-music8-songs-json.ts [--apply] [--artist-slug=oasis] [--limit=N] [--sleep-ms=30] [--progress-every=50] [--not-found-out=tmp/not-found.csv] [--songs-local-dir=PATH] [--video-id-fallback] [--video-index-in=PATH] [--video-index-out=PATH] [--ids-from-csv=PATH]

既定は dry-run（DB 更新なし）。--apply で original_release_date を上書き。
--not-found-out で Music8 曲 JSON が無かった行だけ CSV 出力（DB は変更しない）。
--video-id-fallback で slug 失敗時に video_id 索引から正しい曲 JSON を引く（コラボ曲の slug ずれ対策）。`);
    return;
  }

  const songsBase = resolveMusic8SongsBaseUrl();
  console.log(`[backfill-release] mode=${opts.apply ? 'APPLY' : 'dry-run'} songsBase=${songsBase}`);

  const idsFilter = opts.idsFromCsv ? readSongIdsFromCsv(opts.idsFromCsv) : null;
  if (idsFilter) {
    console.log(`[backfill-release] ids-from-csv: ${idsFilter.size} song ids`);
  }

  const videoIndex = await loadVideoIndex(opts);

  const rows = await fetchAllSongs(opts.artistSlug, idsFilter);
  console.log(`[backfill-release] songs in DB: ${rows.length}`);
  const toProcess = opts.limit != null ? Math.min(opts.limit, rows.length) : rows.length;
  console.log(
    `[backfill-release] processing ${toProcess} songs (sleep-ms=${opts.sleepMs}, progress-every=${opts.progressEvery})…`,
  );

  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');

  const videoBySongId = opts.videoIdFallback
    ? await fetchRepresentativeVideoIdBySongId(
        admin,
        rows.map((r) => r.id),
      )
    : new Map<string, string>();
  if (videoBySongId.size > 0) {
    console.log(`[backfill-release] representative video_id loaded: ${videoBySongId.size} songs`);
  }

  const notFoundHeader = [
    'id',
    'display_title',
    'main_artist',
    'song_title',
    'music8_artist_slug',
    'music8_song_slug',
    'resolved_artist_slug',
    'resolved_song_slug',
    'original_release_date',
    'json_url',
  ];
  const notFoundLines: string[] = opts.notFoundOut ? [notFoundHeader.join(',')] : [];

  let scanned = 0;
  let noSlug = 0;
  let notFound = 0;
  let videoResolved = 0;
  let noVideoId = 0;
  let videoMiss = 0;
  let noReleaseDate = 0;
  let unchanged = 0;
  let updated = 0;
  let failed = 0;

  const logProgress = (force = false) => {
    if (!force && scanned % opts.progressEvery !== 0) return;
    console.log(
      `[progress] scanned=${scanned}/${toProcess} updated=${updated} unchanged=${unchanged} not_found=${notFound} video_resolved=${videoResolved} no_slug=${noSlug}`,
    );
  };

  for (const row of rows) {
    if (opts.limit != null && scanned >= opts.limit) break;
    scanned += 1;

    const slugs = resolveMusic8Slugs(row);
    if (!slugs) {
      noSlug += 1;
      logProgress();
      continue;
    }
    if (opts.artistSlug && slugs.artistSlug !== opts.artistSlug) {
      continue;
    }

    let json = await fetchWpSongsFileJson(slugs.artistSlug, slugs.songSlug, opts.songsLocalDir);
    if (opts.sleepMs > 0) await sleep(opts.sleepMs);

    let effectiveSlugs = slugs;
    if (!json && opts.videoIdFallback) {
      const videoId = resolveVideoIdForSong(row, videoBySongId);
      if (!videoId) {
        noVideoId += 1;
      } else if (videoIndex && videoIndex.size > 0) {
        const hit = videoIndex.get(videoId);
        if (!hit) {
          videoMiss += 1;
        } else if (hit.artistSlug !== slugs.artistSlug || hit.songSlug !== slugs.songSlug) {
          effectiveSlugs = { artistSlug: hit.artistSlug, songSlug: hit.songSlug };
          json = await fetchWpSongsFileJson(hit.artistSlug, hit.songSlug, opts.songsLocalDir);
          if (opts.sleepMs > 0) await sleep(opts.sleepMs);
          if (json) {
            videoResolved += 1;
            console.log(
              `[video-index] ${(row.display_title ?? row.id).trim()} ${slugs.artistSlug}_${slugs.songSlug} -> ${hit.artistSlug}_${hit.songSlug} (${videoId})`,
            );
          }
        }
      }
      if (!json) {
        const byVideo = await tryResolveJsonByVideoFallback(row, slugs, videoBySongId, opts.songsLocalDir);
        if (opts.sleepMs > 0) await sleep(opts.sleepMs);
        if (byVideo) {
          json = byVideo.json;
          effectiveSlugs = byVideo.effectiveSlugs;
          videoResolved += 1;
          console.log(
            `[video-fetch] ${(row.display_title ?? row.id).trim()} ${slugs.artistSlug}_${slugs.songSlug} -> ${effectiveSlugs.artistSlug}_${effectiveSlugs.songSlug} (${videoId})`,
          );
        } else if (videoId) {
          videoMiss += 1;
        }
      }
    }

    if (!json) {
      notFound += 1;
      if (opts.notFoundOut) {
        notFoundLines.push(
          [
            csvCell(row.id),
            csvCell(row.display_title),
            csvCell(row.main_artist),
            csvCell(row.song_title),
            csvCell(row.music8_artist_slug),
            csvCell(row.music8_song_slug),
            csvCell(slugs.artistSlug),
            csvCell(slugs.songSlug),
            csvCell(row.original_release_date),
            csvCell(music8SongJsonUrl(slugs.artistSlug, slugs.songSlug)),
          ].join(','),
        );
      }
      logProgress();
      continue;
    }

    const nextIso = resolveOriginalReleaseDateFromMusic8WpSongsFileJson(json);
    if (!nextIso) {
      noReleaseDate += 1;
      logProgress();
      continue;
    }

    const curIso = normDateKey(row.original_release_date);
    if (curIso === nextIso) {
      unchanged += 1;
      logProgress();
      continue;
    }

    const label = (row.display_title ?? row.song_title ?? row.id).trim();
    console.log(
      `[update] ${label} (${effectiveSlugs.artistSlug}_${effectiveSlugs.songSlug}) ${curIso ?? '—'} -> ${nextIso}`,
    );

    if (!opts.apply) {
      updated += 1;
      continue;
    }

    const { error } = await admin
      .from('songs')
      .update({ original_release_date: nextIso })
      .eq('id', row.id);

    if (error) {
      failed += 1;
      console.error(`[backfill-release] update failed ${row.id}`, error.message);
    } else {
      updated += 1;
    }
    logProgress();
  }

  logProgress(true);

  if (opts.notFoundOut) {
    const outPath = path.resolve(opts.notFoundOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${notFoundLines.join('\n')}\n`, 'utf8');
    console.log(`[backfill-release] not-found CSV: ${outPath} (${notFoundLines.length - 1} rows)`);
  }

  console.log(
    `[backfill-release] done scanned=${scanned} updated=${updated} unchanged=${unchanged} no_slug=${noSlug} not_found=${notFound} video_resolved=${videoResolved} no_video_id=${noVideoId} video_miss=${videoMiss} no_releaseDate=${noReleaseDate} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
