/**
 * Music8 アーティスト JSON → mc `artists` 一括取り込み（準備・パイロット用）
 *
 * 例:
 *   npx tsx scripts/import-music8-artists-bulk.ts --dry-run --slug=strokes
 *   npx tsx scripts/import-music8-artists-bulk.ts --dry-run --json-file=log/strokes.json
 *   npx tsx scripts/import-music8-artists-bulk.ts --apply --slug=strokes
 *   npx tsx scripts/import-music8-artists-bulk.ts --apply --slugs-file=tmp/artist-slugs.txt
 *   npx tsx scripts/import-music8-artists-bulk.ts --dry-run --artists-dir=E:/m8/public/data/artists --limit=5
 *   npx tsx scripts/import-music8-artists-bulk.ts --apply --artists-dir=E:/m8/public/data/artists
 *   npx tsx scripts/import-music8-artists-bulk.ts --apply --artists-list=E:/m8/public/data/artists.json --artists-dir=E:/m8/public/data/artists
 *
 * ローカル m8:
 *   一覧: E:/m8/public/data/artists.json（mc 参照 log/artists.json）
 *   個別: E:/m8/public/data/artists/{slug}.json のみ（*_songs.json / *_spngs.json は対象外）
 *
 * 計画: docs/music8-artist-import-and-integration-plan.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadArtistsListFromFile,
  upsertArtistFromMusic8Json,
} from '@/lib/music8-artist-import';
import { getMusic8ArtistJsonUrlCandidates } from '@/lib/music8-artist-display';

const GCS_ARTISTS_BASE =
  process.env.MUSIC8_ARTISTS_GCS_BASE?.trim() ||
  'https://storage.googleapis.com/music8-json-prod/data/artists';

type ArtistFailureRow = {
  at: string;
  artistSlug: string;
  stage: 'upsert_artist' | 'no_json';
  reason: string;
  detail?: string;
};

type CliOptions = {
  dryRun: boolean;
  slug: string | null;
  slugsFile: string | null;
  jsonFile: string | null;
  artistsDir: string | null;
  artistsList: string | null;
  fromGcsList: boolean;
  retryFailuresLog: string | null;
  skipArtists: number;
  limit: number | null;
  sleepMs: number;
  failureLogPath: string;
};

/** 既定: JSON と同じ `C:\Users\maeha\json`（`MUSIC8_ARTISTS_FAILURE_LOG_DIR` で上書き可） */
function defaultFailureLogDir(): string {
  const fromEnv = process.env.MUSIC8_ARTISTS_FAILURE_LOG_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  if (process.platform === 'win32') {
    const winDefault = 'C:/Users/maeha/json';
    if (fs.existsSync(winDefault)) return winDefault;
  }
  return path.resolve(process.cwd(), 'tmp');
}

function defaultFailureLogPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(defaultFailureLogDir(), `music8-artist-import-failures-${stamp}.jsonl`);
}

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function appendArtistFailure(filePath: string, row: Omit<ArtistFailureRow, 'at'>): void {
  ensureDirForFile(filePath);
  const line: ArtistFailureRow = { at: new Date().toISOString(), ...row };
  fs.appendFileSync(filePath, `${JSON.stringify(line)}\n`, 'utf8');
}

/** 失敗ログ JSONL から slug 一覧（重複除去・ファイル順） */
export function loadSlugsFromArtistFailureLog(filePath: string): string[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return [];
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const raw of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const o = JSON.parse(line) as { artistSlug?: string };
      const s = typeof o.artistSlug === 'string' ? o.artistSlug.trim().toLowerCase() : '';
      if (s && !seen.has(s)) {
        seen.add(s);
        slugs.push(s);
      }
    } catch {
      // ignore bad line
    }
  }
  return slugs;
}

/** m8 個別アーティスト JSON: `abc.json` のみ。`abc_songs.json` 等は対象外 */
export function isArtistMasterJsonFileName(fileName: string): boolean {
  const base = path.basename(fileName);
  if (!/^[a-z0-9-]+\.json$/i.test(base)) return false;
  const slug = base.slice(0, -'.json'.length);
  return !slug.includes('_');
}

export function slugFromArtistMasterJsonFileName(fileName: string): string | null {
  if (!isArtistMasterJsonFileName(fileName)) return null;
  return path.basename(fileName).slice(0, -'.json'.length).toLowerCase();
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
  let dryRun = true;
  let slug: string | null = null;
  let slugsFile: string | null = null;
  let jsonFile: string | null = null;
  let artistsDir: string | null =
    process.env.MUSIC8_ARTISTS_DIR?.trim() ||
    process.env.MUSIC8_ARTISTS_LOCAL_DIR?.trim() ||
    null;
  let artistsList: string | null = process.env.MUSIC8_ARTISTS_LIST_JSON?.trim() || null;
  let fromGcsList = false;
  let skipArtists = 0;
  let limit: number | null = null;
  let sleepMs = 200;
  let failureLogPath = defaultFailureLogPath();
  let retryFailuresLog: string | null = null;

  for (const a of argv) {
    if (a === '--apply') dryRun = false;
    else if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--slug=')) slug = a.slice('--slug='.length).trim().toLowerCase() || null;
    else if (a.startsWith('--slugs-file=')) slugsFile = a.slice('--slugs-file='.length).trim() || null;
    else if (a.startsWith('--json-file=')) jsonFile = a.slice('--json-file='.length).trim() || null;
    else if (a.startsWith('--artists-dir=')) {
      artistsDir = a.slice('--artists-dir='.length).trim() || null;
    } else if (a.startsWith('--artists-list=')) {
      artistsList = a.slice('--artists-list='.length).trim() || null;
    } else if (a === '--from-artists-list') {
      artistsList = artistsList || 'log/artists.json';
    } else if (a === '--from-gcs-list') fromGcsList = true;
    else if (a.startsWith('--skip-artists=')) {
      const n = parseInt(a.slice('--skip-artists='.length), 10);
      if (Number.isFinite(n) && n >= 0) skipArtists = n;
    } else if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    } else if (a.startsWith('--sleep-ms=')) {
      const n = parseInt(a.slice('--sleep-ms='.length), 10);
      if (Number.isFinite(n) && n >= 0) sleepMs = n;
    } else if (a.startsWith('--failure-log=')) {
      failureLogPath = path.resolve(process.cwd(), a.slice('--failure-log='.length).trim());
    } else if (a.startsWith('--retry-failures=')) {
      retryFailuresLog = a.slice('--retry-failures='.length).trim() || null;
    }
  }

  return {
    dryRun,
    slug,
    slugsFile,
    jsonFile,
    artistsDir,
    artistsList,
    fromGcsList,
    retryFailuresLog,
    skipArtists,
    limit,
    sleepMs,
    failureLogPath,
  };
}

function resolveArtistsDir(dir: string): string {
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

function loadSlugsFromArtistsDir(dir: string): string[] {
  const abs = resolveArtistsDir(dir);
  if (!fs.existsSync(abs)) {
    throw new Error(`artists-dir not found: ${abs}`);
  }
  const slugs: string[] = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    const s = slugFromArtistMasterJsonFileName(ent.name);
    if (s) slugs.push(s);
  }
  return [...new Set(slugs)].sort();
}

function readArtistJsonFromDir(dir: string, slug: string): unknown | null {
  const abs = resolveArtistsDir(dir);
  const filePath = path.join(abs, `${slug.trim().toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  if (!isArtistMasterJsonFileName(path.basename(filePath))) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonUrl(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchArtistJsonBySlug(
  slug: string,
  artistsDir: string | null,
): Promise<unknown | null> {
  const s = slug.trim().toLowerCase();
  if (artistsDir) {
    const local = readArtistJsonFromDir(artistsDir, s);
    if (local) return local;
  }
  const urls = [
    `${GCS_ARTISTS_BASE}/${encodeURIComponent(s)}.json`,
    ...getMusic8ArtistJsonUrlCandidates(s.replace(/-/g, ' ')),
  ];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const json = await fetchJsonUrl(url);
    if (json) return json;
  }
  return null;
}

/** GCS バケット一覧は認証が必要なため、既定では artist_index URL があればそこから slug を読む */
async function loadSlugsFromArtistIndex(): Promise<string[]> {
  const indexUrl =
    process.env.MUSIC8_ARTIST_INDEX_URL?.trim() ||
    'https://storage.googleapis.com/music8-json-prod/data/artist_index.json';
  const json = await fetchJsonUrl(indexUrl);
  if (!json || typeof json !== 'object') {
    console.warn('[import-music8-artists] artist_index not found:', indexUrl);
    return [];
  }
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.artists)) {
    return o.artists
      .map((a) => {
        if (a && typeof a === 'object' && !Array.isArray(a)) {
          const slug = (a as Record<string, unknown>).slug;
          return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
        }
        return '';
      })
      .filter(Boolean);
  }
  const keys = Object.keys(o).filter((k) => /^[a-z0-9-]+$/.test(k));
  return keys;
}

function loadSlugsFromFile(filePath: string): string[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const text = fs.readFileSync(abs, 'utf8');
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));

  let slugs: string[] = [];
  if (opts.jsonFile) {
    const abs = path.isAbsolute(opts.jsonFile)
      ? opts.jsonFile
      : path.resolve(process.cwd(), opts.jsonFile);
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as unknown;
    const admin = createAdminClient();
    if (!admin) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY が必要です');
    }
    const result = await upsertArtistFromMusic8Json({
      admin,
      rawJson: raw,
      dryRun: opts.dryRun,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (opts.retryFailuresLog) {
    slugs = loadSlugsFromArtistFailureLog(opts.retryFailuresLog);
    console.info('[import-music8-artists] retry-failures', opts.retryFailuresLog, 'slugs', slugs.length);
  }
  if (opts.slug) slugs = [opts.slug];
  if (opts.slugsFile) slugs = [...slugs, ...loadSlugsFromFile(opts.slugsFile)];
  if (opts.artistsList && slugs.length === 0) {
    const listPath = path.isAbsolute(opts.artistsList)
      ? opts.artistsList
      : path.resolve(process.cwd(), opts.artistsList);
    const entries = loadArtistsListFromFile(listPath);
    slugs = entries.map((e) => e.slug);
    console.info('[import-music8-artists] artists-list', listPath, 'entries', slugs.length);
  }
  if (opts.artistsDir && slugs.length === 0) {
    slugs = loadSlugsFromArtistsDir(opts.artistsDir);
    console.info(
      '[import-music8-artists] artists-dir',
      resolveArtistsDir(opts.artistsDir),
      'files',
      slugs.length,
    );
  }
  if (opts.fromGcsList) slugs = [...slugs, ...(await loadSlugsFromArtistIndex())];
  slugs = [...new Set(slugs)];

  if (opts.skipArtists > 0) slugs = slugs.slice(opts.skipArtists);
  if (opts.limit != null) slugs = slugs.slice(0, opts.limit);

  if (slugs.length === 0) {
    console.error(
      'Usage: --artists-list=E:/m8/public/data/artists.json --artists-dir=.../artists | --artists-dir=... | --from-artists-list | --slug=abc',
    );
    process.exit(1);
  }

  const admin = createAdminClient();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が必要です');
  }

  let ok = 0;
  let fail = 0;
  let skip = 0;

  for (const slug of slugs) {
    const json = await fetchArtistJsonBySlug(slug, opts.artistsDir);
    if (!json) {
      console.warn('[skip] no JSON', slug);
      if (!opts.dryRun) {
        appendArtistFailure(opts.failureLogPath, {
          artistSlug: slug,
          stage: 'no_json',
          reason: 'artist_json_not_found',
        });
      }
      skip++;
      continue;
    }

    const result = await upsertArtistFromMusic8Json({
      admin,
      rawJson: json,
      dryRun: opts.dryRun,
    });

    if ('error' in result) {
      console.error('[fail]', slug, result.error);
      if (!opts.dryRun) {
        appendArtistFailure(opts.failureLogPath, {
          artistSlug: slug,
          stage: 'upsert_artist',
          reason: 'upsert_failed',
          detail: result.error,
        });
      }
      fail++;
    } else {
      console.log(
        opts.dryRun ? '[dry-run]' : `[${result.mode}]`,
        slug,
        result.artistId ?? '-',
        (result.patch.name as string) ?? '',
      );
      ok++;
    }

    if (opts.sleepMs > 0) await sleep(opts.sleepMs);
  }

  const summary: Record<string, unknown> = {
    dryRun: opts.dryRun,
    total: slugs.length,
    ok,
    fail,
    skip,
  };
  if (!opts.dryRun && (fail > 0 || skip > 0)) {
    summary.failureLogPath = opts.failureLogPath;
  }
  console.log(JSON.stringify(summary, null, 2));
  if (fail > 0) process.exit(1);
}

const cliEntry = (process.argv[1] ?? '').replace(/\\/g, '/');
const isCliEntry =
  cliEntry.endsWith('/import-music8-artists-bulk.ts') ||
  cliEntry.endsWith('/import-music8-artists-bulk');

if (isCliEntry) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}