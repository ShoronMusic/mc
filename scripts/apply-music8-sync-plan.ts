/**
 * diff-music8-sync-plan の manifest に従い、アーティスト → 曲の順で安全に適用する。
 * 既定は dry-run（件数表示 + 子プロセスも --dry-run）。
 *
 * Usage:
 *   npx tsx scripts/apply-music8-sync-plan.ts --manifest=tmp/music8-sync-plan-.../manifest.json
 *   npx tsx scripts/apply-music8-sync-plan.ts --manifest=... --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type Manifest = {
  generatedAt: string;
  songsDir: string;
  artistsDir: string;
  artistsList: string | null;
  counts: {
    songsToApply: number;
    artistsToApply: number;
  };
  files: {
    songKeysApply: string;
    artistSlugsApply: string;
    manifest: string;
  };
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
  }
  return {
    manifest: args.get('manifest')?.trim() || null,
    apply: argv.includes('--apply'),
    sleepMsArtists: parseInt(args.get('sleep-ms-artists') ?? '200', 10),
    sleepMsSongs: parseInt(args.get('sleep-ms-songs') ?? '80', 10),
    skipArtists: argv.includes('--skip-artists'),
    skipSongs: argv.includes('--skip-songs'),
    forwardFile: args.get('forward-file')?.trim() || null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function findRecentManifests(limit = 5): string[] {
  const tmp = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(tmp)) return [];
  const dirs = fs
    .readdirSync(tmp, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('music8-sync-plan'))
    .map((d) => {
      const manifest = path.join(tmp, d.name, 'manifest.json');
      if (!fs.existsSync(manifest)) return null;
      const st = fs.statSync(manifest);
      return { manifest, mtimeMs: st.mtimeMs };
    })
    .filter((x): x is { manifest: string; mtimeMs: number } => x != null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((x) => x.manifest);
  return dirs;
}

function loadManifest(manifestPath: string): Manifest {
  const abs = path.resolve(manifestPath);
  if (!fs.existsSync(abs)) {
    const hints = findRecentManifests();
    const hintText =
      hints.length > 0
        ? `\n直近の manifest 例:\n${hints.map((p) => `  ${p}`).join('\n')}\n（<日時> はプレースホルダーです。実際のフォルダ名に置き換えてください）`
        : '\n先に diff を実行してください:\n  npx tsx scripts/diff-music8-sync-plan.ts --songs-dir=... --artists-dir=... --out-dir=tmp/music8-sync-plan-latest';
    throw new Error(`manifest not found: ${abs}${hintText}`);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8')) as Manifest;
}

function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')).length;
}

function loadForwardArgs(filePath: string | null): string[] {
  if (!filePath?.trim()) return [];
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function runTsx(script: string, args: string[]): void {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', script, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    throw new Error(`failed: npx tsx ${script} (exit ${r.status ?? 'unknown'})`);
  }
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/apply-music8-sync-plan.ts --manifest=tmp/.../manifest.json [--apply]
    [--sleep-ms-artists=200] [--sleep-ms-songs=80]
    [--skip-artists] [--skip-songs]
    [--forward-file=tmp/music8-bulk-forward-args.txt]`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.manifest) {
    printUsage();
    if (!opts.manifest) process.exit(1);
    return;
  }

  const manifest = loadManifest(opts.manifest);
  const artistFile = path.resolve(manifest.files.artistSlugsApply);
  const songFile = path.resolve(manifest.files.songKeysApply);
  const artistCount = countLines(artistFile);
  const songCount = countLines(songFile);
  const mode = opts.apply ? 'apply' : 'dry-run';

  console.log(
    JSON.stringify(
      {
        mode,
        manifest: path.resolve(opts.manifest),
        artistCount,
        songCount,
        artistsDir: manifest.artistsDir,
        songsDir: manifest.songsDir,
      },
      null,
      2,
    ),
  );

  if (!opts.apply) {
    console.error('[apply-music8-sync-plan] dry-run のため DB 更新はしません。本番は --apply を付けて再実行してください。');
  }

  const forward = loadForwardArgs(opts.forwardFile);
  const artistFlag = opts.apply ? '--apply' : '--dry-run';
  const songFlag = opts.apply ? '' : '--dry-run';

  if (!opts.skipArtists && artistCount > 0) {
    const artistArgs = [
      artistFlag,
      `--slugs-file=${artistFile}`,
      `--artists-dir=${manifest.artistsDir}`,
      `--sleep-ms=${opts.sleepMsArtists}`,
    ];
    if (manifest.artistsList) {
      artistArgs.push(`--artists-list=${manifest.artistsList}`);
    }
    console.error(`[apply] artists (${artistCount} slugs)…`);
    runTsx('scripts/import-music8-artists-bulk.ts', artistArgs);
  } else {
    console.error('[apply] skip artists (0件 or --skip-artists)');
  }

  if (!opts.skipSongs && songCount > 0) {
    const songArgs = [
      `--import-keys-file=${songFile}`,
      `--songs-local-dir=${manifest.songsDir}`,
      `--sleep-ms=${opts.sleepMsSongs}`,
      '--failure-log=tmp/music8-sync-apply-failures.jsonl',
      ...forward,
    ];
    if (songFlag) songArgs.unshift(songFlag);
    console.error(`[apply] songs (${songCount} keys)…`);
    runTsx('scripts/import-music8-songs-bulk.ts', songArgs);
  } else {
    console.error('[apply] skip songs (0件 or --skip-songs)');
  }

  if (opts.apply) {
    const statePath = path.resolve('tmp', 'music8-sync-last-success.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({ completedAt: new Date().toISOString(), manifest: path.resolve(opts.manifest) }, null, 2)}\n`,
      'utf8',
    );
    console.error(`[apply] wrote state: ${statePath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
