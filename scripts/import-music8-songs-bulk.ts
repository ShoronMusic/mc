import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCanonicalMainArtistName } from '@/lib/music8-canonical-artist-name';
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
  /** `artistSlug_songSlug` → video_id（11文字）または YouTube URL の JSON ファイルパス */
  videoOverridesPath: string | null;
  /** `--video-overrides` のキーに列挙された曲だけ取り込む（全 index 走査をしない） */
  onlyVideoOverrideKeys: boolean;
  /** `artist_slug_song_slug` を1行1キーとしたテキスト（差分スクリプトの出力など）。指定時はこのキーだけ処理 */
  importKeysFile: string | null;
  /** ローカル `data/songs` 等。HTTP の曲 JSON が失敗したとき `{artist}_{slug}.json` をここから読む（絶対パス可） */
  songsLocalDir: string | null;
};

type ArtistSongsListRow = {
  id?: unknown;
  slug?: unknown;
  date?: unknown;
  title?: { rendered?: unknown } | unknown;
  style?: unknown;
  ytvideoid?: unknown;
  spotify_track_id?: unknown;
  spotify_name?: unknown;
  spotify_artists?: unknown;
  spotify_popularity?: unknown;
  featured_media_url?: unknown;
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

/** `--name=value` の value が真とみなせるか（限定フラグ用） */
function parseTruthyArgValue(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === '' || t === '1' || t === 'true' || t === 'yes' || t === 'on';
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

  const videoOverridesOnlyPath = args.get('video-overrides-only')?.trim() || null;
  const onlyVideoOverrideKeys =
    Boolean(videoOverridesOnlyPath) ||
    flags.has('only-video-overrides-keys') ||
    flags.has('overrides-only') ||
    (args.has('only-video-overrides-keys') && parseTruthyArgValue(args.get('only-video-overrides-keys') ?? '')) ||
    (args.has('overrides-only') && parseTruthyArgValue(args.get('overrides-only') ?? ''));

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
    videoOverridesPath: videoOverridesOnlyPath || args.get('video-overrides')?.trim() || null,
    onlyVideoOverrideKeys,
    importKeysFile: args.get('import-keys-file')?.trim() || null,
    songsLocalDir: args.get('songs-local-dir')?.trim() || null,
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
  --video-overrides=tmp/music8-video-overrides.json
  --video-overrides-only=tmp/hokan050101.txt   この JSON のキーに書いた曲だけ取り込む（全 index 走査しない・推奨）
  --only-video-overrides-keys   --video-overrides と併用。キー列挙分だけ処理
  --only-video-overrides-keys=1 同上（= 形式でも可）
  --overrides-only              同上の短い別名
  --import-keys-file=tmp/music8-on-disk-not-in-db.txt   1行1キー（artist_song）だけ取り込む。diff スクリプトの out-missing と併用可。任意で --video-overrides も併用
  --songs-local-dir=E:\\m8\\public\\data\\songs   HTTP が通らないとき曲 JSON をローカルから読む（import-keys-file 大量投入で推奨）
  --help

Notes:
  - artist slug の供給元は優先順で:
    1) --artist-slugs
    2) --artist-slugs-file
    3) --artist-index-url
  - --skip-artists=N は index のキー順で先頭 N 件を捨てる（--limit-artists=3000 の続きは --skip-artists=3000）。
  - --from-artist は slug の辞書順 >= でフィルタするため、index 順の「続き」とは一致しないことがあります。
  - DB更新には .env.local の SUPABASE_SERVICE_ROLE_KEY が必要です。
  - --video-overrides は JSON オブジェクト。キーは artistSlug と songSlug をアンダースコアでつないだ形（例: police_every-breath-you-take）、値は 11 文字の video_id または YouTube の URL。Music8 JSON に video_id が無い行の手動補完に使う。
  - --video-overrides-only=PATH は「そのファイルに書いた artist_song キーだけ」を必ず取り込む（限定モード固定）。手動補完ファイル専用で全曲走査しない。
  - --only-video-overrides-keys（別名 --overrides-only）は --video-overrides と併用時に同じ限定。先頭の JSON ログに onlyVideoOverrideKeys:true と stderr の限定モード表示を確認。
  - --import-keys-file はキー一覧のみで処理（全 index 走査しない）。--only-video-overrides-keys より優先してタスク列を作る。--video-overrides は任意（未取得 JSON 時の補完用）。
  - --songs-local-dir は Music8 の data/songs をローカルパスで指定。HTTP 取得に失敗したあと {artist}_{slug}.json をディスクから読む。`);
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

/** 11 文字の video_id、または watch URL / youtu.be から ID を抽出 */
function normalizeYoutubeVideoIdInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t.includes('://') ? t : `https://${t}`);
    if (u.hostname === 'youtu.be' || u.hostname.endsWith('.youtu.be')) {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const embed = parts.indexOf('embed');
    if (embed >= 0 && parts[embed + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[embed + 1])) return parts[embed + 1];
    const shorts = parts.indexOf('shorts');
    if (shorts >= 0 && parts[shorts + 1] && /^[a-zA-Z0-9_-]{11}$/.test(parts[shorts + 1])) return parts[shorts + 1];
  } catch {
    /* ignore */
  }
  return null;
}

function loadVideoOverridesMap(filePath: string | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!filePath?.trim()) return m;
  const abs = path.resolve(process.cwd(), filePath.trim());
  if (!fs.existsSync(abs)) {
    console.warn(`[import-music8-songs-bulk] video overrides file not found: ${abs}`);
    return m;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.warn('[import-music8-songs-bulk] video overrides JSON parse error', e);
    return m;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return m;
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const key = k.trim().toLowerCase();
    if (!key) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    const id = normalizeYoutubeVideoIdInput(v);
    if (!id) {
      console.warn(
        `[import-music8-songs-bulk] skip invalid video override key=${JSON.stringify(key)} value=${JSON.stringify(v)}`,
      );
      continue;
    }
    m.set(key, id);
  }
  console.log(`[import-music8-songs-bulk] loaded ${m.size} video override(s) from ${abs}`);
  return m;
}

function pickVideoIdWithManualOverrides(
  listRow: ArtistSongsListRow,
  songJson: SongJson,
  overrides: Map<string, string>,
  artistSlug: string,
  songSlug: string,
  effectiveSongSlug: string,
): { videoId: string | null; fromOverride: boolean } {
  const direct = pickVideoId(listRow, songJson);
  if (direct) return { videoId: direct, fromOverride: false };
  const a = artistSlug.trim().toLowerCase();
  for (const slug of [effectiveSongSlug, songSlug]) {
    const key = `${a}_${slug.trim().toLowerCase()}`;
    const id = overrides.get(key);
    if (id) return { videoId: id, fromOverride: true };
  }
  return { videoId: null, fromOverride: false };
}

/** 曲 JSON が無いとき、`--video-overrides` だけで video_id があるか */
function peekOverrideVideoIdFromMap(
  overrides: Map<string, string>,
  artistSlug: string,
  songSlug: string,
  effectiveSongSlug: string,
): string | null {
  const a = artistSlug.trim().toLowerCase();
  for (const slug of [effectiveSongSlug, songSlug]) {
    const id = overrides.get(`${a}_${slug.trim().toLowerCase()}`);
    if (id) return id;
  }
  return null;
}

/** 複合キー `artistSlug_songSlug`（先頭の `_` で分割。artist はハイフン区切り想定） */
function splitVideoOverrideCompositeKey(key: string): { artistSlug: string; songSlug: string } | null {
  const k = key.trim().toLowerCase();
  const u = k.indexOf('_');
  if (u <= 0 || u >= k.length - 1) return null;
  return { artistSlug: k.slice(0, u), songSlug: k.slice(u + 1) };
}

function buildTasksByArtistFromOverrides(
  videoOverrides: Map<string, string>,
): Map<string, { songSlug: string; compositeKey: string }[]> {
  const by = new Map<string, { songSlug: string; compositeKey: string }[]>();
  for (const compositeKey of videoOverrides.keys()) {
    const p = splitVideoOverrideCompositeKey(compositeKey);
    if (!p) {
      console.warn(`[import-music8-songs-bulk] skip malformed override key: ${compositeKey}`);
      continue;
    }
    const arr = by.get(p.artistSlug) ?? [];
    arr.push({ songSlug: p.songSlug, compositeKey });
    by.set(p.artistSlug, arr);
  }
  return by;
}

/** diff スクリプトの `out-missing` など（1行1キー・# 行と空行はスキップ・重複行は無視） */
function buildTasksByArtistFromKeysFile(absPath: string): Map<string, { songSlug: string; compositeKey: string }[]> {
  if (!fs.existsSync(absPath)) {
    throw new Error(`import-keys-file が見つかりません: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf8');
  const by = new Map<string, { songSlug: string; compositeKey: string }[]>();
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const keyLower = t.toLowerCase();
    if (seen.has(keyLower)) continue;
    seen.add(keyLower);
    const p = splitVideoOverrideCompositeKey(keyLower);
    if (!p) {
      console.warn(`[import-music8-songs-bulk] skip invalid keys-file line: ${JSON.stringify(t)}`);
      continue;
    }
    const arr = by.get(p.artistSlug) ?? [];
    arr.push({ songSlug: p.songSlug, compositeKey: keyLower });
    by.set(p.artistSlug, arr);
  }
  return by;
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

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * `songs/{artist}_{slug}.json` が見つからない場合の補完用。
 * artist list (`*_songs.json`) の行から、取り込める最小限の JSON 形を合成する。
 */
function buildFallbackSongJsonFromListRow(
  listRow: ArtistSongsListRow,
  mainArtist: string,
  songSlug: string,
): SongJson {
  const title = pickSongTitleFromListRow(listRow) ?? songSlug.replace(/-/g, ' ');
  const yt = asStringOrNull(listRow.ytvideoid) ?? asStringOrNull(listRow.acf?.ytvideoid);
  const spotifyTrackId = asStringOrNull(listRow.spotify_track_id);
  const spotifyName = asStringOrNull(listRow.spotify_name);
  const spotifyArtists = asStringOrNull(listRow.spotify_artists);
  const spotifyPopularity = asNumberOrNull(listRow.spotify_popularity);
  const date = asStringOrNull(listRow.date);
  const style = listRow.style ?? null;
  const featuredMediaUrl = asStringOrNull(listRow.featured_media_url);

  return {
    title,
    ...(yt ? { videoId: yt, ytvideoid: yt } : {}),
    artists: [{ name: mainArtist }],
    ...(date ? { date, original_release_date: date } : {}),
    ...(style != null ? { style } : {}),
    ...(spotifyTrackId ? { spotify_track_id: spotifyTrackId } : {}),
    ...(spotifyName ? { spotify_name: spotifyName } : {}),
    ...(spotifyArtists ? { spotify_artists: spotifyArtists } : {}),
    ...(spotifyPopularity != null ? { spotify_popularity: spotifyPopularity } : {}),
    ...(featuredMediaUrl ? { featured_media_url: featuredMediaUrl } : {}),
    ...(typeof listRow.id === 'number' ? { music8_song_id: listRow.id } : {}),
    music8_song_slug: songSlug,
  };
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

/** オーバーライドの song slug と `*_songs.json` の行を突き合わせる（本番リストとキーが完全一致しないことがある） */
function findListRowForOverrideSong(rows: ArtistSongsListRow[], taskSongSlug: string): ArtistSongsListRow | undefined {
  const t = taskSongSlug.trim().toLowerCase();
  if (!t) return undefined;
  const exact = rows.find((r) => typeof r.slug === 'string' && r.slug.trim().toLowerCase() === t);
  if (exact) return exact;
  return rows.find((r) => {
    const raw = typeof r.slug === 'string' ? r.slug.trim() : '';
    if (!raw) return false;
    const c = raw.toLowerCase();
    return slugMatches(t, c) || slugMatches(c, t);
  });
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

function loadSongJsonFromLocalDisk(songsLocalDir: string, artistSlug: string, songSlugForFile: string): SongJson | null {
  const trimmed = songsLocalDir.trim();
  const base = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  const filePath = path.join(base, `${artistSlug}_${songSlugForFile}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SongJson;
    }
  } catch {
    return null;
  }
  return null;
}

type Counters = {
  artists: number;
  songsListed: number;
  songsAttempted: number;
  songsImported: number;
  songsImportedWithListFallback: number;
  /** Music8/list に無くても `--video-overrides` で video_id を埋めた件数（dry-run 含む） */
  songsVideoOverrideApplied: number;
  songsDryRun: number;
  songsSkippedMissingSlug: number;
  songsSkippedMissingSongJson: number;
  songsSkippedMissingVideoId: number;
  failures: number;
};

async function resolveMainArtistForImport(
  artistSlug: string,
  songJson: SongJson,
  getCanonicalMainArtist: (slug: string) => Promise<string | null>,
): Promise<string> {
  const fromMaster = await getCanonicalMainArtist(artistSlug);
  if (fromMaster) return fromMaster;
  const fromSong = pickMainArtist(songJson);
  if (fromSong) return fromSong;
  return artistSlug.replace(/-/g, ' ');
}

async function importOneArtistSongRow(params: {
  opts: CliOptions;
  counters: Counters;
  admin: SupabaseClient | null;
  videoOverrides: Map<string, string>;
  artistSlug: string;
  row: ArtistSongsListRow;
  getCanonicalMainArtist: (slug: string) => Promise<string | null>;
}): Promise<void> {
  const { opts, counters, admin, videoOverrides, artistSlug, row, getCanonicalMainArtist } = params;
  const songSlug = typeof row.slug === 'string' ? row.slug.trim() : '';
  if (!songSlug) {
    counters.songsSkippedMissingSlug += 1;
    return;
  }
  counters.songsAttempted += 1;

  const directSongUrl = `${opts.songsBase}/${encodeURIComponent(artistSlug)}_${encodeURIComponent(songSlug)}.json`;
  let songJson = await fetchJsonWithOptionalGcsAuth<SongJson>(directSongUrl);
  let effectiveSongSlug = songSlug;
  let importedWithListFallback = false;
  if ((!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) && opts.songsLocalDir?.trim()) {
    const localJ = loadSongJsonFromLocalDisk(opts.songsLocalDir, artistSlug, songSlug);
    if (localJ) {
      songJson = localJ;
      console.log(`[song-json-local] ${artistSlug}_${songSlug}`);
    }
  }
  if (!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) {
    const altSlug = await resolveSongSlugFromArtistPages(opts.artistSongsBase, artistSlug, songSlug);
    if (altSlug && altSlug !== songSlug) {
      const altSongUrl = `${opts.songsBase}/${encodeURIComponent(artistSlug)}_${encodeURIComponent(altSlug)}.json`;
      const altSongJson = await fetchJsonWithOptionalGcsAuth<SongJson>(altSongUrl);
      if (altSongJson && typeof altSongJson === 'object' && !Array.isArray(altSongJson)) {
        songJson = altSongJson;
        effectiveSongSlug = altSlug;
      } else if (opts.songsLocalDir?.trim()) {
        const localAlt = loadSongJsonFromLocalDisk(opts.songsLocalDir, artistSlug, altSlug);
        if (localAlt) {
          songJson = localAlt;
          effectiveSongSlug = altSlug;
          console.log(`[song-json-local] ${artistSlug}_${altSlug} (alt slug)`);
        }
      }
    }
  }
  if (!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) {
    const fallbackMainArtist =
      (await getCanonicalMainArtist(artistSlug)) ?? artistSlug.replace(/-/g, ' ');
    const fallbackSongJson = buildFallbackSongJsonFromListRow(row, fallbackMainArtist, songSlug);
    const fallbackVideoId = pickVideoId(row, fallbackSongJson);
    const fallbackSongTitle = pickSongTitle(fallbackSongJson);
    if (fallbackVideoId && fallbackSongTitle) {
      songJson = fallbackSongJson;
      importedWithListFallback = true;
      console.log(`[fallback] use artist list row: ${artistSlug}_${songSlug}`);
    }
  }
  if (!songJson || typeof songJson !== 'object' || Array.isArray(songJson)) {
    const overrideOnlyId = peekOverrideVideoIdFromMap(videoOverrides, artistSlug, songSlug, effectiveSongSlug);
    if (overrideOnlyId) {
      const mainArtistGuess =
        (await getCanonicalMainArtist(artistSlug)) ?? artistSlug.replace(/-/g, ' ');
      songJson = {
        title: songSlug.replace(/-/g, ' '),
        artists: [{ name: mainArtistGuess }],
        music8_song_slug: songSlug,
      };
      console.warn(
        `[song-json-minimal] ${artistSlug}_${songSlug} 曲 JSON を取得できませんでしたが、--video-overrides の video_id で続行します (${directSongUrl})`,
      );
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
    return;
  }

  const { videoId, fromOverride } = pickVideoIdWithManualOverrides(
    row,
    songJson,
    videoOverrides,
    artistSlug,
    songSlug,
    effectiveSongSlug,
  );
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
    return;
  }

  const songTitle = pickSongTitle(songJson);
  const fallbackSongTitle = pickSongTitleFromListRow(row);
  const mainArtist = await resolveMainArtistForImport(artistSlug, songJson, getCanonicalMainArtist);
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
    return;
  }

  if (fromOverride) {
    counters.songsVideoOverrideApplied += 1;
    console.log(`[video-override] ${artistSlug}_${effectiveSongSlug} video=${videoId}`);
  }

  if (opts.dryRun) {
    counters.songsDryRun += 1;
    console.log(
      `[dry-run] ${artistSlug}_${effectiveSongSlug} video=${videoId}${fromOverride ? ' (override)' : ''} title=${JSON.stringify(songTitle ?? fallbackSongTitle)}`,
    );
    await sleepMs(opts.sleepMs);
    return;
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
      if (importedWithListFallback) counters.songsImportedWithListFallback += 1;
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

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const videoOverrides = loadVideoOverridesMap(opts.videoOverridesPath);
  const admin = opts.dryRun ? null : createAdminClient();

  if (!opts.dryRun && !admin) {
    throw new Error('admin client unavailable. .env.local の SUPABASE_SERVICE_ROLE_KEY を確認してください。');
  }

  if (opts.onlyVideoOverrideKeys && !opts.importKeysFile && videoOverrides.size === 0) {
    throw new Error(
      '--only-video-overrides-keys には、少なくとも1件の有効な video id を含む --video-overrides が必要です（空文字の値は読み込み時に無視されます）。',
    );
  }

  let targetArtists: string[];
  let byArtistTasks: Map<string, { songSlug: string; compositeKey: string }[]> | null = null;

  if (opts.importKeysFile) {
    const absKeys = path.resolve(process.cwd(), opts.importKeysFile);
    byArtistTasks = buildTasksByArtistFromKeysFile(absKeys);
    targetArtists = Array.from(byArtistTasks.keys()).sort((a, b) => a.localeCompare(b));
  } else if (opts.onlyVideoOverrideKeys) {
    byArtistTasks = buildTasksByArtistFromOverrides(videoOverrides);
    targetArtists = Array.from(byArtistTasks.keys()).sort((a, b) => a.localeCompare(b));
  } else {
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
    targetArtists =
      opts.limitArtists && opts.limitArtists > 0
        ? startedArtists.slice(0, opts.limitArtists)
        : startedArtists;
  }

  if (targetArtists.length === 0) {
    throw new Error('対象 artist slug が 0 件です。');
  }
  if (opts.importKeysFile && byArtistTasks) {
    let taskN = 0;
    for (const arr of byArtistTasks.values()) taskN += arr.length;
    if (taskN === 0) {
      throw new Error('import-keys-file に有効なキーが1件もありません。');
    }
  }

  const keyedOnlyMode = Boolean(opts.importKeysFile) || opts.onlyVideoOverrideKeys;
  let keyedTaskTotal = 0;
  if (byArtistTasks) {
    for (const arr of byArtistTasks.values()) keyedTaskTotal += arr.length;
  }

  const counters: Counters = {
    artists: 0,
    songsListed: 0,
    songsAttempted: 0,
    songsImported: 0,
    songsImportedWithListFallback: 0,
    songsVideoOverrideApplied: 0,
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
        importKeysFile: opts.importKeysFile,
        onlyVideoOverrideKeys: opts.onlyVideoOverrideKeys,
        keyedOnlyMode,
        keyedTaskTotal: keyedOnlyMode ? keyedTaskTotal : null,
        artistCount: targetArtists.length,
        skipArtists: keyedOnlyMode ? 0 : opts.skipArtists,
        artistSongsBase: opts.artistSongsBase,
        songsBase: opts.songsBase,
        songsLocalDir: opts.songsLocalDir,
        sleepMs: opts.sleepMs,
        failureLogPath: opts.failureLogPath,
        videoOverridesLoaded: videoOverrides.size,
      },
      null,
      2,
    ),
  );

  if (opts.importKeysFile) {
    console.error(
      `[import-music8-songs-bulk] キー一覧モード ON: import-keys-file から ${keyedTaskTotal} 曲 / アーティスト ${targetArtists.length} 件を処理します。`,
    );
  } else if (opts.onlyVideoOverrideKeys) {
    console.error(
      `[import-music8-songs-bulk] 限定モード ON: オーバーライド ${videoOverrides.size} 曲 / アーティスト ${targetArtists.length} 件のみ処理します。`,
    );
  } else if (videoOverrides.size > 0) {
    console.warn(
      '[import-music8-songs-bulk] 全 index 走査モードです（ログの onlyVideoOverrideKeys が false）。手動補完だけなら --only-video-overrides-keys または --overrides-only を付けてください。',
    );
  }

  const canonicalMainArtistBySlug = new Map<string, string | null>();
  const getCanonicalMainArtist = async (artistSlug: string): Promise<string | null> => {
    if (!canonicalMainArtistBySlug.has(artistSlug)) {
      const resolved = await resolveCanonicalMainArtistName({
        artistSlug,
        admin,
        fetchJson: fetchJsonWithOptionalGcsAuth,
      });
      canonicalMainArtistBySlug.set(artistSlug, resolved);
    }
    return canonicalMainArtistBySlug.get(artistSlug) ?? null;
  };

  for (const artistSlug of targetArtists) {
    counters.artists += 1;
    const listUrl = `${opts.artistSongsBase}/${encodeURIComponent(artistSlug)}_songs.json`;
    const listJson = await fetchJsonWithOptionalGcsAuth<ArtistSongsJson>(listUrl);
    const rows = Array.isArray(listJson?.songs) ? listJson.songs : [];

    if (keyedOnlyMode && byArtistTasks) {
      const tasks = byArtistTasks.get(artistSlug) ?? [];
      counters.songsListed += tasks.length;
      console.log(
        `[artist] ${artistSlug} ${opts.importKeysFile ? 'key-import-tasks' : 'override-tasks'}=${tasks.length}`,
      );
      for (const task of tasks) {
        let row = findListRowForOverrideSong(rows, task.songSlug);
        if (!row) {
          if (rows.length > 0) {
            const sample = rows
              .slice(0, 8)
              .map((r) => (typeof r.slug === 'string' ? r.slug : JSON.stringify(r.slug)))
              .join(', ');
            console.warn(
              `[artist] ${artistSlug} no list row for slug=${task.songSlug} (sample slugs: ${sample}); using synthetic row`,
            );
          } else {
            console.warn(`[artist] ${artistSlug} _songs.json has 0 songs; using synthetic row for slug=${task.songSlug}`);
          }
          row = { slug: task.songSlug };
        }
        await importOneArtistSongRow({
          opts,
          counters,
          admin,
          videoOverrides,
          artistSlug,
          row,
          getCanonicalMainArtist,
        });
      }
      continue;
    }

    const pickedRows =
      opts.limitSongsPerArtist && opts.limitSongsPerArtist > 0
        ? rows.slice(0, opts.limitSongsPerArtist)
        : rows;
    counters.songsListed += pickedRows.length;

    console.log(`[artist] ${artistSlug} songs=${pickedRows.length}`);

    for (const row of pickedRows) {
      await importOneArtistSongRow({
        opts,
        counters,
        admin,
        videoOverrides,
        artistSlug,
        row,
        getCanonicalMainArtist,
      });
    }
  }

  console.log(JSON.stringify(counters, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

