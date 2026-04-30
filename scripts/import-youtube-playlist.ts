import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSongAndVideo } from '@/lib/song-entities';

type CliOptions = {
  playlistUrl: string | null;
  playlistId: string | null;
  maxItems: number | null;
  outJson: string | null;
  outCsv: string | null;
  importToDb: boolean;
  dryRun: boolean;
  skipDbDedupe: boolean;
};

type PlaylistItem = {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
};

type ImportRow = {
  artist: string;
  title: string;
  videoId: string;
  url: string;
  rawTitle: string;
  channelTitle: string;
};

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

  const maxRaw = args.get('max-items');
  const maxNum = typeof maxRaw === 'string' ? Math.floor(Number(maxRaw)) : NaN;
  const maxItems = Number.isFinite(maxNum) && maxNum > 0 ? maxNum : null;

  return {
    playlistUrl: args.get('playlist-url') ?? null,
    playlistId: args.get('playlist-id') ?? null,
    maxItems,
    outJson: args.get('out-json') ?? null,
    outCsv: args.get('out-csv') ?? null,
    importToDb: flags.has('import'),
    dryRun: flags.has('dry-run'),
    skipDbDedupe: flags.has('skip-db-dedupe'),
  };
}

function printUsage(): void {
  console.log(`Usage:
  tsx scripts/import-youtube-playlist.ts --playlist-url=... [options]
  tsx scripts/import-youtube-playlist.ts --playlist-id=... [options]

Options:
  --playlist-url=https://www.youtube.com/playlist?list=...
  --playlist-id=PL...
  --max-items=200
  --out-json=tmp/youtube-playlist.json
  --out-csv=tmp/youtube-playlist.csv
  --import             DB (songs/song_videos) へ取り込み
  --dry-run            --import 時に upsert を実行せずログのみ
  --skip-db-dedupe     既存 song_videos(video_id) との重複除外をスキップ
  --help

Env:
  - YOUTUBE_API_KEY（必須）
  - SUPABASE_SERVICE_ROLE_KEY（--import または DB重複除外で必要）
`);
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function resolvePlaylistId(opts: CliOptions): string | null {
  if (opts.playlistId?.trim()) return opts.playlistId.trim();
  const u = opts.playlistUrl?.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    const id = parsed.searchParams.get('list')?.trim();
    return id || null;
  } catch {
    return null;
  }
}

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(',') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function buildCsv(rows: ImportRow[]): string {
  const header = ['artist', 'title', 'videoId', 'url', 'rawTitle', 'channelTitle'].join(',');
  const body = rows.map((r) =>
    [
      csvEscape(r.artist),
      csvEscape(r.title),
      csvEscape(r.videoId),
      csvEscape(r.url),
      csvEscape(r.rawTitle),
      csvEscape(r.channelTitle),
    ].join(','),
  );
  return [header, ...body].join('\n') + '\n';
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function cleanupTitleSuffix(s: string): string {
  return s
    .replace(/\s*\[(official|lyrics?|audio|hd|4k)[^\]]*\]\s*$/i, '')
    .replace(/\s*\((official|lyrics?|audio|hd|4k)[^)]*\)\s*$/i, '')
    .trim();
}

function extractArtistAndTitle(rawTitle: string, channelTitle: string): { artist: string; title: string } {
  const normalized = cleanupTitleSuffix(normalizeWhitespace(rawTitle));
  const sepMatch = normalized.match(/^(.+?)\s*-\s*(.+)$/);
  if (sepMatch) {
    const artist = normalizeWhitespace(sepMatch[1] ?? '');
    const title = normalizeWhitespace(sepMatch[2] ?? '');
    if (artist && title) return { artist, title };
  }
  const artistFallback = normalizeWhitespace(channelTitle) || 'Unknown Artist';
  return {
    artist: artistFallback,
    title: normalized || rawTitle || 'Unknown Title',
  };
}

async function fetchPlaylistItems(playlistId: string, maxItems: number | null): Promise<PlaylistItem[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error('YOUTUBE_API_KEY が未設定です。');

  const out: PlaylistItem[] = [];
  let pageToken: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = (await res.json()) as {
      error?: { message?: string };
      nextPageToken?: string;
      items?: Array<{
        snippet?: { title?: string; channelTitle?: string };
        contentDetails?: { videoId?: string };
      }>;
    };
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `playlistItems API failed: HTTP ${res.status}`);
    }
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const videoId = item?.contentDetails?.videoId?.trim();
      if (!videoId) continue;
      out.push({
        videoId,
        rawTitle: item?.snippet?.title?.trim() ?? '',
        channelTitle: item?.snippet?.channelTitle?.trim() ?? '',
      });
      if (maxItems && out.length >= maxItems) return out;
    }
    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return out;
}

async function loadExistingVideoIdSet(videoIds: string[]): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set<string>();
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY が必要です。');
  const existing = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    const { data, error } = await admin.from('song_videos').select('video_id').in('video_id', chunk);
    if (error) throw new Error(`song_videos 重複確認に失敗: ${error.message}`);
    for (const row of data ?? []) {
      const v = (row as { video_id?: unknown }).video_id;
      if (typeof v === 'string' && v.trim()) existing.add(v.trim());
    }
  }
  return existing;
}

async function importRowsToDb(rows: ImportRow[], dryRun: boolean): Promise<{ imported: number; failed: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY が必要です。');
  let imported = 0;
  let failed = 0;
  for (const row of rows) {
    if (dryRun) {
      console.log(`[dry-run] import ${row.videoId} :: ${row.artist} - ${row.title}`);
      continue;
    }
    try {
      const songId = await upsertSongAndVideo({
        supabase: admin,
        videoId: row.videoId,
        mainArtist: row.artist,
        songTitle: row.title,
        variant: 'official',
      });
      if (songId) imported += 1;
      else failed += 1;
    } catch (e) {
      failed += 1;
      console.error(`[import-error] ${row.videoId}`, e);
    }
  }
  return { imported, failed };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const playlistId = resolvePlaylistId(opts);
  if (!playlistId) {
    throw new Error('playlistId を解決できません。--playlist-url または --playlist-id を指定してください。');
  }

  const fetched = await fetchPlaylistItems(playlistId, opts.maxItems);
  const uniqueByVideo = new Map<string, PlaylistItem>();
  for (const item of fetched) {
    if (!uniqueByVideo.has(item.videoId)) uniqueByVideo.set(item.videoId, item);
  }
  const uniqueItems = [...uniqueByVideo.values()];

  let existingSet = new Set<string>();
  if (!opts.skipDbDedupe) {
    existingSet = await loadExistingVideoIdSet(uniqueItems.map((x) => x.videoId));
  }

  const filtered = uniqueItems.filter((x) => !existingSet.has(x.videoId));
  const rows: ImportRow[] = filtered.map((item) => {
    const parsed = extractArtistAndTitle(item.rawTitle, item.channelTitle);
    return {
      artist: parsed.artist,
      title: parsed.title,
      videoId: item.videoId,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      rawTitle: item.rawTitle,
      channelTitle: item.channelTitle,
    };
  });

  if (opts.outJson) {
    const p = path.resolve(process.cwd(), opts.outJson);
    ensureParentDir(p);
    fs.writeFileSync(p, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    console.log(`[write] json: ${p}`);
  }
  if (opts.outCsv) {
    const p = path.resolve(process.cwd(), opts.outCsv);
    ensureParentDir(p);
    fs.writeFileSync(p, buildCsv(rows), 'utf8');
    console.log(`[write] csv : ${p}`);
  }

  console.log(
    JSON.stringify(
      {
        playlistId,
        fetched: fetched.length,
        uniqueVideoIds: uniqueItems.length,
        filteredAsExisting: existingSet.size,
        candidates: rows.length,
      },
      null,
      2,
    ),
  );

  if (opts.importToDb) {
    const result = await importRowsToDb(rows, opts.dryRun);
    console.log(JSON.stringify({ import: result, dryRun: opts.dryRun }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
