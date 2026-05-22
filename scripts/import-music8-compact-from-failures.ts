/**
 * import の failure JSONL（例: tmp/music8-import-overnight.jsonl）に載った曲を、
 * Music8 の compact-songs.json（配列・ytvideoid 等あり）から突き合わせて Supabase に upsert する。
 *
 * Usage:
 *   npx tsx scripts/import-music8-compact-from-failures.ts --failures=tmp/music8-import-overnight.jsonl --compact=E:/m8/public/data/compact-songs.json
 *   npx tsx scripts/import-music8-compact-from-failures.ts ... --dry-run
 *
 * compact が ~90MB のときメモリが足りない場合:
 *   set NODE_OPTIONS=--max-old-space-size=8192
 */
import fs from 'node:fs';
import path from 'node:path';
import { jsonrepair } from 'jsonrepair';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachMusic8SongDataIfFetched, upsertSongAndVideo } from '@/lib/song-entities';

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

type FailRow = { artistSlug?: string; songSlug?: string | null };

function parseArgs(argv: string[]): {
  failuresPath: string;
  compactPath: string;
  dryRun: boolean;
  reportSkips: boolean;
  sleepMs: number;
  help: boolean;
} {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
    } else {
      flags.add(token.slice(2).trim());
    }
  }
  return {
    failuresPath: args.get('failures')?.trim() || path.join('tmp', 'music8-import-overnight.jsonl'),
    compactPath: args.get('compact')?.trim() || '',
    dryRun: flags.has('dry-run'),
    reportSkips: flags.has('report-skips'),
    sleepMs: Math.max(0, Number.parseInt(args.get('sleep-ms') ?? '80', 10) || 80),
    help: flags.has('help') || flags.has('h'),
  };
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/import-music8-compact-from-failures.ts --compact=E:/m8/public/data/compact-songs.json [--failures=tmp/music8-import-overnight.jsonl] [--dry-run] [--sleep-ms=80]

  --report-skips   compact と突き合わせ、notFound / missingVideo / missingTitle のキー一覧だけ JSON 出力（DB 不要）

Requires .env.local SUPABASE_SERVICE_ROLE_KEY (unless --dry-run or --report-skips).

compact-songs.json が大きいときは事前に:
  set NODE_OPTIONS=--max-old-space-size=8192`);
}

function normalizeSlugSegment(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  try {
    return decodeURIComponent(t.replace(/\+/g, '%20')).toLowerCase();
  } catch {
    return t.toLowerCase();
  }
}

/** fail のキーと突き合わせる複合キー候補（compact の artists[0].slug × song.slug） */
function compositeKeysFromCompactSong(entry: Record<string, unknown>): string[] {
  const songSlugRaw = entry.slug;
  const songPlain = typeof songSlugRaw === 'string' ? songSlugRaw.trim().toLowerCase() : '';
  const songDecoded = normalizeSlugSegment(songSlugRaw);
  const songVariants = new Set<string>();
  if (songPlain) songVariants.add(songPlain);
  if (songDecoded) songVariants.add(songDecoded);

  const artists = entry.artists;
  if (!Array.isArray(artists) || artists.length === 0) return [];
  const a0 = artists[0];
  if (!a0 || typeof a0 !== 'object' || Array.isArray(a0)) return [];
  const slugRaw = (a0 as Record<string, unknown>).slug;
  const artistPlain = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : '';
  const artistDecoded = normalizeSlugSegment(slugRaw);
  const artistVariants = new Set<string>();
  if (artistPlain) artistVariants.add(artistPlain);
  if (artistDecoded) artistVariants.add(artistDecoded);

  const keys = new Set<string>();
  for (const a of artistVariants) {
    for (const s of songVariants) {
      keys.add(`${a}_${s}`);
    }
  }
  return [...keys];
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 二重引用符の「見た目代替文字」だけ ASCII `"` に（曲名内の `'` / U+2019 は触らない） */
function sanitizeJsonSmartQuotes(raw: string): string {
  let s = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return s.replace(
    /[\u201C\u201D\u201E\u201F\u2033\u2036\u2039\u203A\u00AB\u00BB\u301D-\u301F\uFF02\u275D\u275E\uFE41\uFE42\uFE43\uFE44\uFF62\uFF63]/g,
    '"',
  );
}

function parseCompactJsonFile(absPath: string): unknown {
  const raw = fs.readFileSync(absPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (first) {
    const sanitized = sanitizeJsonSmartQuotes(raw);
    try {
      return JSON.parse(sanitized);
    } catch {
      try {
        const repaired = jsonrepair(sanitized);
        console.error('[compact-import] used jsonrepair (smart quotes / minor JSON syntax fixes)');
        return JSON.parse(repaired);
      } catch {
        try {
          const repaired = jsonrepair(raw);
          console.error('[compact-import] used jsonrepair on raw file');
          return JSON.parse(repaired);
        } catch {
          throw first;
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }
  if (!opts.compactPath.trim()) {
    console.error('--compact=PATH が必要です（例: E:/m8/public/data/compact-songs.json）');
    printUsage();
    process.exit(1);
  }

  loadDotEnvLocal();
  const admin = opts.dryRun || opts.reportSkips ? null : createAdminClient();
  if (!opts.dryRun && !opts.reportSkips && !admin) {
    console.error('createAdminClient が null。.env.local の SUPABASE_SERVICE_ROLE_KEY を確認してください。');
    process.exit(1);
  }

  const failAbs = path.resolve(process.cwd(), opts.failuresPath);
  const compactAbs = path.resolve(process.cwd(), opts.compactPath);
  if (!fs.existsSync(failAbs)) {
    console.error(`failure ファイルがありません: ${failAbs}`);
    process.exit(1);
  }
  if (!fs.existsSync(compactAbs)) {
    console.error(`compact JSON がありません: ${compactAbs}`);
    process.exit(1);
  }

  const failRaw = fs.readFileSync(failAbs, 'utf8');
  const tasks = new Map<string, { artistSlug: string; songSlug: string }>();
  for (const line of failRaw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let row: FailRow;
    try {
      row = JSON.parse(t) as FailRow;
    } catch {
      continue;
    }
    const a = typeof row.artistSlug === 'string' ? row.artistSlug.trim().toLowerCase() : '';
    const s = typeof row.songSlug === 'string' ? row.songSlug.trim().toLowerCase() : '';
    if (!a || !s) continue;
    tasks.set(`${a}_${s}`, { artistSlug: a, songSlug: s });
  }

  console.error('[compact-import] loading compact JSON (may take memory on large files)…');
  let compactParsed: unknown;
  try {
    compactParsed = parseCompactJsonFile(compactAbs);
  } catch (e) {
    console.error(
      'compact JSON のパースに失敗しました。スマートクォート置換後もダメな場合は、Music8 側で ASCII の " のみの JSON を書き出すか、NODE_OPTIONS=--max-old-space-size=8192（メモリ不足時）を試してください。',
      e,
    );
    process.exit(1);
  }
  if (!Array.isArray(compactParsed)) {
    console.error('compact-songs.json は配列の JSON である必要があります。');
    process.exit(1);
  }

  const byKey = new Map<string, Record<string, unknown>>();
  let dupKeys = 0;
  for (const item of compactParsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const keys = compositeKeysFromCompactSong(entry);
    for (const k of keys) {
      if (byKey.has(k)) dupKeys += 1;
      byKey.set(k, entry);
    }
  }

  if (opts.reportSkips) {
    const skipNotFound: string[] = [];
    const skipMissingVideo: string[] = [];
    const skipMissingTitle: string[] = [];
    for (const [, task] of tasks) {
      const key = `${task.artistSlug}_${task.songSlug}`;
      const entry = byKey.get(key);
      if (!entry) {
        skipNotFound.push(key);
        continue;
      }
      const vidRaw = (entry as Record<string, unknown>).videoid;
      const yt =
        typeof entry.ytvideoid === 'string'
          ? entry.ytvideoid.trim()
          : typeof vidRaw === 'string'
            ? vidRaw.trim()
            : typeof entry.videoId === 'string'
              ? entry.videoId.trim()
              : '';
      if (!yt || !/^[a-zA-Z0-9_-]{11}$/.test(yt)) {
        skipMissingVideo.push(key);
        continue;
      }
      const titleRaw = entry.title;
      const songTitle = typeof titleRaw === 'string' ? titleRaw.trim() : '';
      let mainArtist = '';
      const artists = entry.artists;
      if (Array.isArray(artists) && artists[0] && typeof artists[0] === 'object' && !Array.isArray(artists[0])) {
        const n = (artists[0] as Record<string, unknown>).name;
        if (typeof n === 'string') mainArtist = n.trim();
      }
      if (!songTitle || !mainArtist) skipMissingTitle.push(key);
    }
    console.log(
      JSON.stringify(
        {
          failureTasksUnique: tasks.size,
          notFoundInCompact: skipNotFound.sort(),
          missingVideo: skipMissingVideo.sort(),
          missingTitle: skipMissingTitle.sort(),
        },
        null,
        2,
      ),
    );
    return;
  }

  let imported = 0;
  let skippedDry = 0;
  let notFound = 0;
  let missingVideo = 0;
  let missingTitle = 0;
  let failed = 0;

  for (const [, task] of tasks) {
    const key = `${task.artistSlug}_${task.songSlug}`;
    const entry = byKey.get(key);
    if (!entry) {
      console.warn(`[compact-import] not found in compact: ${key}`);
      notFound += 1;
      continue;
    }

    const vidRaw = (entry as Record<string, unknown>).videoid;
    const yt =
      typeof entry.ytvideoid === 'string'
        ? entry.ytvideoid.trim()
        : typeof vidRaw === 'string'
          ? vidRaw.trim()
          : typeof entry.videoId === 'string'
            ? entry.videoId.trim()
            : '';
    if (!yt || !/^[a-zA-Z0-9_-]{11}$/.test(yt)) {
      console.warn(`[compact-import] invalid video id: ${key}`);
      missingVideo += 1;
      continue;
    }

    const titleRaw = entry.title;
    const songTitle = typeof titleRaw === 'string' ? titleRaw.trim() : '';
    let mainArtist = '';
    const artists = entry.artists;
    if (Array.isArray(artists) && artists[0] && typeof artists[0] === 'object' && !Array.isArray(artists[0])) {
      const n = (artists[0] as Record<string, unknown>).name;
      if (typeof n === 'string') mainArtist = n.trim();
    }
    if (!songTitle || !mainArtist) {
      console.warn(`[compact-import] missing title or artist name: ${key}`);
      missingTitle += 1;
      continue;
    }

    const songJson: Record<string, unknown> = {
      ...entry,
      videoId: yt,
      ytvideoid: typeof entry.ytvideoid === 'string' ? entry.ytvideoid : yt,
    };

    if (opts.dryRun) {
      console.log(`[dry-run] ${key} video=${yt} :: ${mainArtist} - ${songTitle}`);
      skippedDry += 1;
      await sleepMs(opts.sleepMs);
      continue;
    }

    try {
      const songId = await upsertSongAndVideo({
        supabase: admin,
        videoId: yt,
        mainArtist,
        songTitle,
        variant: 'official',
      });
      if (!songId) {
        failed += 1;
      } else {
        await attachMusic8SongDataIfFetched(admin, songId, songJson);
        imported += 1;
        console.log(`[compact-import] ok ${key}`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[compact-import] error ${key}`, e);
    }
    await sleepMs(opts.sleepMs);
  }

  console.log(
    JSON.stringify(
      {
        failureTasksUnique: tasks.size,
        compactIndexKeys: byKey.size,
        compactDupKeyWrites: dupKeys,
        imported,
        dryRunRows: skippedDry,
        notFoundInCompact: notFound,
        missingVideo,
        missingTitle,
        failedUpsert: failed,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
