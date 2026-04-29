import fs from 'node:fs';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachMusic8SongDataIfFetched, upsertSongAndVideo } from '@/lib/song-entities';

type CliOptions = {
  dryRun: boolean;
  artistSongsBase: string;
  songsBase: string;
  artistIndexUrl: string;
  artistSlugs: string[];
  artistSlugsFile: string | null;
  fromArtist: string | null;
  /** artist_index の先頭から何件スキップするか（再開用・index のキー順） */
  skipArtists: number;
  limitArtists: number | null;
  limitSongsPerArtist: number | null;
  sleepMs: number;
  failureLogPath: string;
};

type ArtistSongsListRow = {
  slug?: unknown;
  ytvideoid?: unknown;
  acf?: { ytvideoid?: unknown } | null;
};

type ArtistSongsJson = {
  songs?: ArtistSongsListRow[];
};

type SongJson = Record<string, unknown> & {
  title?: unknown;
  videoId?: unknown;
  ytvideoid?: unknown;
  artists?: unknown;
  spotify_artists?: unknown;
};

type ArtistPageSongItem = {
  slug?: unknown;
  title?: { rendered?: unknown } | unknown;
  ytvideoid?: unknown;
  acf?: { ytvideoid?: unknown } | null;
};

type ArtistPageJson = {
  songs?: ArtistPageSongItem[];
};

type FailureRow = {
  stage: string;
  artistSlug: string;
  songSlug: string | null;
  reason: string;
  detail?: string;
};

const ARTIST_PAGES_MAX = 6;

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

let storageClient: Storage | null = null;

function readServiceAccountFromEnv(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
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

function getStorageClient(): Storage {
  if (storageClient) return storageClient;
  const envCreds = readServiceAccountFromEnv();
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() || envCreds?.project_id?.trim() || undefined;
  storageClient = new Storage({
    ...(projectId ? { projectId } : {}),
    ...(envCreds
      ? {
          credentials: {
            client_email: envCreds.client_email,
            private_key: envCreds.private_key,
          },
        }
      : {}),
  });
  return storageClient;
}

function parseGcsUrl(url: string): { bucket: string; objectPath: string } | null {
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

async function fetchJsonWithOptionalGcsAuth<T>(url: string): Promise<T | null> {
  const gcs = parseGcsUrl(url);
  if (gcs) {
    try {
      const [buffer] = await getStorageClient()
        .bucket(gcs.bucket)
        .file(gcs.objectPath)
        .download();
      return JSON.parse(buffer.toString('utf-8')) as T;
    } catch {
      // 認証失敗時は公開 GET へフォールバック
    }
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
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

function trimSlash(v: string): string {
  return v.replace(/\/+$/, '');
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function asPositiveIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function asNonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 0 ? i : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  const flags = new Set<string>();

  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      const k = token.slice(2, eq).trim();
      const v = token.slice(eq + 1).trim();
      if (k) args.set(k, v);
    } else {
      flags.add(token.slice(2).trim());
    }
  }

  const artistSongsBase = trimSlash(
    args.get('artist-songs-base') ??
      process.env.MUSIC8_ARTIST_SONGS_BASE?.trim() ??
      'https://xs867261.xsrv.jp/data/data/artists',
  );
  const songsBase = trimSlash(
    args.get('songs-base') ??
      process.env.MUSIC8_BULK_SONGS_BASE?.trim() ??
      'https://xs867261.xsrv.jp/data/data/songs',
  );
  const artistIndexUrl =
    args.get('artist-index-url') ??
    process.env.MUSIC8_ARTIST_INDEX_URL?.trim() ??
    'https://storage.googleapis.com/music8-json-prod/data/musicaichat/v1/index/artist_index.json';
  const artistSlugs = parseCsv(args.get('artist-slugs') ?? '');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const failureLogPath =
    args.get('failure-log') ??
    path.resolve(process.cwd(), 'tmp', `music8-import-failures-${stamp}.jsonl`);

  return {
    dryRun: flags.has('dry-run'),
    artistSongsBase,
    songsBase,
    artistIndexUrl,
    artistSlugs,
    artistSlugsFile: args.get('artist-slugs-file') ?? null,
    fromArtist: args.get('from-artist') ?? null,
    skipArtists: asNonNegativeInt(args.get('skip-artists'), 0),
    limitArtists: asPositiveIntOrNull(args.get('limit-artists')),
    limitSongsPerArtist: asPositiveIntOrNull(args.get('limit-songs-per-artist')),
    sleepMs: asNonNegativeInt(args.get('sleep-ms'), 100),
    failureLogPath,
  };
}

function printUsage(): void {
  console.log(`Usage:
  tsx scripts/import-music8-songs-bulk.ts [options]

Options:
  --dry-run
  --artist-slugs=police,queen
  --artist-slugs-file=tmp/music8-artist-slugs.txt
  --artist-index-url=https://.../index/artist_index.json
  --artist-songs-base=https://xs867261.xsrv.jp/data/data/artists
  --songs-base=https://xs867261.xsrv.jp/data/data/songs
  --from-artist=police
  --skip-artists=3000
  --limit-artists=100
  --limit-songs-per-artist=200
  --sleep-ms=100
  --failure-log=tmp/music8-import-failures.jsonl
  --help

Notes:
  - artist slug の供給元は優先順で:
    1) --artist-slugs
    2) --artist-slugs-file
    3) --artist-index-url
  - --skip-artists=N は index のキー順で先頭 N 件を捨てる（--limit-artists=3000 の続きは --skip-artists=3000）。
  - --from-artist は slug の辞書順 >= でフィルタするため、index 順の「続き」とは一致しないことがあります。
  - DB更新には .env.local の SUPABASE_SERVICE_ROLE_KEY が必要です。`);
}

function normalizeArtistSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/_+/g, '-');
}

function uniqueKeepOrder(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v0 of values) {
    const v = normalizeArtistSlug(v0);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function appendFailure(filePath: string, row: FailureRow): void {
  ensureDirForFile(filePath);
  fs.appendFileSync(filePath, JSON.stringify(row) + '\n', 'utf8');
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readArtistSlugsFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const txt = fs.readFileSync(filePath, 'utf8');
  const rows = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return uniqueKeepOrder(rows);
}

async function fetchArtistSlugsFromIndex(url: string): Promise<string[]> {
  const json = await fetchJsonWithOptionalGcsAuth<Record<string, unknown>>(url);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  return uniqueKeepOrder(Object.keys(json));
}

function pickVideoId(listRow: ArtistSongsListRow, songJson: SongJson): string | null {
  const cands = [
    listRow.ytvideoid,
    listRow.acf?.ytvideoid,
    songJson.videoId,
    songJson.ytvideoid,
  ];
  for (const c of cands) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (t) return t;
  }
  return null;
}

function pickSongTitle(songJson: SongJson): string | null {
  if (typeof songJson.title === 'string' && songJson.title.trim()) return songJson.title.trim();
  const tr = songJson.title;
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const rendered = (tr as { rendered?: unknown }).rendered;
    if (typeof rendered === 'string' && rendered.trim()) return rendered.trim();
  }
  return null;
}

function pickSongTitleFromListRow(listRow: ArtistSongsListRow): string | null {
  const tr = (listRow as { title?: unknown }).title;
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const rendered = (tr as { rendered?: unknown }).rendered;
    if (typeof rendered === 'string' && rendered.trim()) return rendered.trim();
  }
  return null;
}

function pickMainArtist(songJson: SongJson): string | null {
  if (Array.isArray(songJson.artists) && songJson.artists.length > 0) {
    const first = songJson.artists[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const name = (first as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  }
  if (typeof songJson.spotify_artists === 'string' && songJson.spotify_artists.trim()) {
    const top = songJson.spotify_artists.split(',')[0]?.trim();
    if (top) return top;
  }
  return null;
}

async function resolveArtistSlugs(opts: CliOptions): Promise<string[]> {
  if (opts.artistSlugs.length > 0) return uniqueKeepOrder(opts.artistSlugs);
  if (opts.artistSlugsFile) {
    const fromFile = readArtistSlugsFile(path.resolve(process.cwd(), opts.artistSlugsFile));
    if (fromFile.length > 0) return fromFile;
  }
  return fetchArtistSlugsFromIndex(opts.artistIndexUrl);
}

function slugMatches(target: string, candidate: string): boolean {
  const t = target.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!t || !c) return false;
  if (t === c) return true;
  if (c.startsWith(`${t}-`)) return true;
  return false;
}

async function resolveSongSlugFromArtistPages(
  artistSongsBase: string,
  artistSlug: string,
  songSlug: string,
): Promise<string | null> {
  for (let page = 1; page <= ARTIST_PAGES_MAX; page += 1) {
    const pageUrl = `${artistSongsBase}/${encodeURIComponent(artistSlug)}/${page}.json`;
    const pageJson = await fetchJsonWithOptionalGcsAuth<ArtistPageJson>(pageUrl);
    const songs = Array.isArray(pageJson?.songs) ? pageJson.songs : [];
    const found = songs.find((s) => {
      const raw = typeof s.slug === 'string' ? s.slug.trim() : '';
      return raw ? slugMatches(songSlug, raw) : false;
    });
    if (found && typeof found.slug === 'string' && found.slug.trim()) {
      return found.slug.trim();
    }
  }
  return null;
}

type Counters = {
  artists: number;
  songsListed: number;
  songsAttempted: number;
  songsImported: number;
  songsDryRun: number;
  songsSkippedMissingSlug: number;
  songsSkippedMissingSongJson: number;
  songsSkippedMissingVideoId: number;
  failures: number;
};

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const admin = opts.dryRun ? null : createAdminClient();

  if (!opts.dryRun && !admin) {
    throw new Error('admin client unavailable. .env.local の SUPABASE_SERVICE_ROLE_KEY を確認してください。');
  }

  const allArtists = await resolveArtistSlugs(opts);
  if (allArtists.length === 0) {
    throw new Error('対象 artist slug が 0 件です。--artist-slugs / --artist-slugs-file / --artist-index-url を確認してください。');
  }

  let chain = allArtists;
  if (opts.skipArtists > 0) {
    chain = chain.slice(opts.skipArtists);
  }
  const startedArtists = opts.fromArtist
    ? chain.filter((a) => a >= normalizeArtistSlug(opts.fromArtist ?? ''))
    : chain;
  const targetArtists =
    opts.limitArtists && opts.limitArtists > 0
      ? startedArtists.slice(0, opts.limitArtists)
      : startedArtists;

  const counters: Counters = {
    artists: 0,
    songsListed: 0,
    songsAttempted: 0,
    songsImported: 0,
    songsDryRun: 0,
    songsSkippedMissingSlug: 0,
    songsSkippedMissingSongJson: 0,
    songsSkippedMissingVideoId: 0,
    failures: 0,
  };

  console.log(
    JSON.stringify(
      {
        mode: opts.dryRun ? 'dry-run' : 'import',
        artistCount: targetArtists.length,
        skipArtists: opts.skipArtists,
        artistSongsBase: opts.artistSongsBase,
        songsBase: opts.songsBase,
        sleepMs: opts.sleepMs,
        failureLogPath: opts.failureLogPath,
      },
      null,
      2,
    ),
  );

  for (const artistSlug of targetArtists) {
    counters.artists += 1;
    const listUrl = `${opts.artistSongsBase}/${encodeURIComponent(artistSlug)}_songs.json`;
    const listJson = await fetchJsonWithOptionalGcsAuth<ArtistSongsJson>(listUrl);
    const rows = Array.isArray(listJson?.songs) ? listJson.songs : [];
    const pickedRows =
      opts.limitSongsPerArtist && opts.limitSongsPerArtist > 0
        ? rows.slice(0, opts.limitSongsPerArtist)
        : rows;
    counters.songsListed += pickedRows.length;

    console.log(`[artist] ${artistSlug} songs=${pickedRows.length}`);

    for (const row of pickedRows) {
      const songSlug = typeof row.slug === 'string' ? row.slug.trim() : '';
      if (!songSlug) {
        counters.songsSkippedMissingSlug += 1;
        continue;
      }
      counters.songsAttempted += 1;

      const directSongUrl = `${opts.songsBase}/${encodeURIComponent(artistSlug)}_${encodeURIComponent(songSlug)}.json`;
      let songJson = await fetchJsonWithOptionalGcsAuth<SongJson>(directSongUrl);
      let effectiveSongSlug = songSlug;
      if (!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) {
        const altSlug = await resolveSongSlugFromArtistPages(opts.artistSongsBase, artistSlug, songSlug);
        if (altSlug && altSlug !== songSlug) {
          const altSongUrl = `${opts.songsBase}/${encodeURIComponent(artistSlug)}_${encodeURIComponent(altSlug)}.json`;
          const altSongJson = await fetchJsonWithOptionalGcsAuth<SongJson>(altSongUrl);
          if (altSongJson && typeof altSongJson === 'object' && !Array.isArray(altSongJson)) {
            songJson = altSongJson;
            effectiveSongSlug = altSlug;
          }
        }
      }
      if (!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) {
        counters.songsSkippedMissingSongJson += 1;
        counters.failures += 1;
        appendFailure(opts.failureLogPath, {
          stage: 'fetch_song_json',
          artistSlug,
          songSlug,
          reason: 'song_json_not_found',
          detail: directSongUrl,
        });
        await sleepMs(opts.sleepMs);
        continue;
      }

      const videoId = pickVideoId(row, songJson);
      if (!videoId) {
        counters.songsSkippedMissingVideoId += 1;
        counters.failures += 1;
        appendFailure(opts.failureLogPath, {
          stage: 'extract_video_id',
          artistSlug,
          songSlug,
          reason: 'video_id_missing',
          detail: directSongUrl,
        });
        await sleepMs(opts.sleepMs);
        continue;
      }

      const songTitle = pickSongTitle(songJson);
      const fallbackSongTitle = pickSongTitleFromListRow(row);
      const mainArtist = pickMainArtist(songJson) ?? artistSlug.replace(/-/g, ' ');
      if (!songTitle && !fallbackSongTitle) {
        counters.failures += 1;
        appendFailure(opts.failureLogPath, {
          stage: 'extract_song_title',
          artistSlug,
          songSlug,
          reason: 'song_title_missing',
          detail: directSongUrl,
        });
        await sleepMs(opts.sleepMs);
        continue;
      }

      if (opts.dryRun) {
        counters.songsDryRun += 1;
        console.log(
          `[dry-run] ${artistSlug}_${effectiveSongSlug} video=${videoId} title=${JSON.stringify(songTitle ?? fallbackSongTitle)}`,
        );
        await sleepMs(opts.sleepMs);
        continue;
      }

      try {
        const songId = await upsertSongAndVideo({
          supabase: admin,
          videoId,
          mainArtist,
          songTitle: songTitle ?? fallbackSongTitle,
          variant: 'official',
        });
        if (!songId) {
          counters.failures += 1;
          appendFailure(opts.failureLogPath, {
            stage: 'upsert_song_and_video',
            artistSlug,
            songSlug,
            reason: 'song_id_not_created',
            detail: `videoId=${videoId}`,
          });
        } else {
          await attachMusic8SongDataIfFetched(admin, songId, songJson);
          counters.songsImported += 1;
        }
      } catch (e) {
        counters.failures += 1;
        appendFailure(opts.failureLogPath, {
          stage: 'import_exception',
          artistSlug,
          songSlug,
          reason: 'exception',
          detail: e instanceof Error ? e.message : String(e),
        });
      }

      await sleepMs(opts.sleepMs);
    }
  }

  console.log(JSON.stringify(counters, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

