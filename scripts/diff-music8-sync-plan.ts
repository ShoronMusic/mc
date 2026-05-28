/**
 * Music8 ローカル JSON と mc DB の差分計画（新規曲 + 既存曲更新 + 新規/更新アーティスト）。
 *
 * Usage:
 *   npx tsx scripts/diff-music8-sync-plan.ts --songs-dir=E:/m8/public/data/songs --artists-dir=E:/m8/public/data/artists
 *   npx tsx scripts/diff-music8-sync-plan.ts ... --since-days=8 --out-dir=tmp/music8-sync-plan
 *
 * 出力:
 *   {out-dir}/manifest.json
 *   {out-dir}/song-keys-new.txt
 *   {out-dir}/song-keys-stale.txt
 *   {out-dir}/song-keys-apply.txt   （new + stale 合体）
 *   {out-dir}/artist-slugs-new.txt
 *   {out-dir}/artist-slugs-stale.txt
 *   {out-dir}/artist-slugs-apply.txt
 */

import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { diffMusic8LibrarySync } from '@/lib/music8-sync-diff';

const DEFAULT_STATE = path.join('tmp', 'music8-sync-last-success.json');

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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sinceDays = parseInt(args.get('since-days') ?? '', 10);
  const sinceIso = args.get('since')?.trim();
  let sinceMs: number | undefined;
  if (sinceIso) {
    const t = Date.parse(sinceIso);
    if (Number.isFinite(t)) sinceMs = t;
  } else if (Number.isFinite(sinceDays) && sinceDays > 0) {
    sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  } else {
    const statePath = args.get('state-file')?.trim() || DEFAULT_STATE;
    const absState = path.resolve(statePath);
    if (fs.existsSync(absState)) {
      try {
        const st = JSON.parse(fs.readFileSync(absState, 'utf8')) as { completedAt?: string };
        const t = st.completedAt ? Date.parse(st.completedAt) : NaN;
        if (Number.isFinite(t)) sinceMs = t;
      } catch {
        /* use default below */
      }
    }
    if (sinceMs == null) sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  }

  return {
    songsDir: args.get('songs-dir')?.trim() || null,
    artistsDir: args.get('artists-dir')?.trim() || null,
    artistsList: args.get('artists-list')?.trim() || null,
    outDir: args.get('out-dir')?.trim() || path.join('tmp', `music8-sync-plan-${stamp}`),
    sinceMs,
    fullFingerprint: args.get('full-fingerprint') === '1' || argv.includes('--full-fingerprint'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function writeLines(filePath: string, lines: string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/diff-music8-sync-plan.ts \\
    --songs-dir=E:\\\\m8\\\\public\\\\data\\\\songs \\
    --artists-dir=E:\\\\m8\\\\public\\\\data\\\\artists \\
    [--artists-list=E:\\\\m8\\\\public\\\\data\\\\artists.json] \\
    [--since-days=7] [--since=2026-05-18T00:00:00.000Z] \\
    [--state-file=tmp/music8-sync-last-success.json] \\
    [--out-dir=tmp/music8-sync-plan-...] [--full-fingerprint]

Requires SUPABASE_SERVICE_ROLE_KEY in .env.local`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }
  if (!opts.songsDir || !opts.artistsDir) {
    console.error('--songs-dir と --artists-dir が必要です。');
    printUsage();
    process.exit(1);
  }

  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient が null です。.env.local を確認してください。');
    process.exit(1);
  }

  const result = await diffMusic8LibrarySync(admin, {
    songsDir: opts.songsDir,
    artistsDir: opts.artistsDir,
    artistsListPath: opts.artistsList,
    sinceMs: opts.sinceMs,
    alwaysCheckFingerprint: opts.fullFingerprint,
  });

  const songKeysApply = [...new Set([...result.newSongKeys, ...result.staleSongKeys])].sort((a, b) =>
    a.localeCompare(b),
  );
  const artistSlugsApply = [...new Set([...result.newArtistSlugs, ...result.staleArtistSlugs])].sort(
    (a, b) => a.localeCompare(b),
  );

  const outDir = path.resolve(opts.outDir);
  const paths = {
    songKeysNew: path.join(outDir, 'song-keys-new.txt'),
    songKeysStale: path.join(outDir, 'song-keys-stale.txt'),
    songKeysApply: path.join(outDir, 'song-keys-apply.txt'),
    artistSlugsNew: path.join(outDir, 'artist-slugs-new.txt'),
    artistSlugsStale: path.join(outDir, 'artist-slugs-stale.txt'),
    artistSlugsApply: path.join(outDir, 'artist-slugs-apply.txt'),
    manifest: path.join(outDir, 'manifest.json'),
  };

  writeLines(paths.songKeysNew, result.newSongKeys);
  writeLines(paths.songKeysStale, result.staleSongKeys);
  writeLines(paths.songKeysApply, songKeysApply);
  writeLines(paths.artistSlugsNew, result.newArtistSlugs);
  writeLines(paths.artistSlugsStale, result.staleArtistSlugs);
  writeLines(paths.artistSlugsApply, artistSlugsApply);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sinceIso: new Date(opts.sinceMs).toISOString(),
    songsDir: path.resolve(opts.songsDir),
    artistsDir: path.resolve(opts.artistsDir),
    artistsList: opts.artistsList ? path.resolve(opts.artistsList) : null,
    counts: {
      newSongs: result.newSongKeys.length,
      staleSongs: result.staleSongKeys.length,
      songsToApply: songKeysApply.length,
      newArtists: result.newArtistSlugs.length,
      staleArtists: result.staleArtistSlugs.length,
      artistsToApply: artistSlugsApply.length,
    },
    stats: result.stats,
    files: paths,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({ outDir, ...manifest.counts, manifest: paths.manifest }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
