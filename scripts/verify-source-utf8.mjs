#!/usr/bin/env node
/**
 * 追跡ソースが UTF-8 として妥当か検査する（無効バイト・NUL の検出）。
 * Windows でのディスク破損・同期ツールの副作用でソースが壊れる問題の早期検知用。
 *
 * Usage:
 *   node scripts/verify-source-utf8.mjs
 *   node scripts/verify-source-utf8.mjs --fix
 *     → 追跡ファイルは git HEAD から復元し、残りは NUL 除去を試みる。
 *     → ファイル全体がランダムバイナイになる破損は直せない（リモートから再取得が必要）。
 */
import { execFileSync } from 'child_process';
import { createReadStream, readFileSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.md',
]);

const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

function decodeUtf8Fatal(buf) {
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

function parseArgs(argv) {
  const fix = argv.includes('--fix');
  return { fix };
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      await walk(p, out);
    } else {
      const ext = extname(e.name).toLowerCase();
      if (EXT.has(ext)) out.push(p);
    }
  }
}

/** ストリームで読み、fatal UTF-8 と NUL を検査。 */
function checkFile(path) {
  return new Promise((resolve) => {
    const chunks = [];
    const stream = createReadStream(path);
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', () => resolve({ ok: false, reason: 'read error' }));
    stream.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (buf.includes(0)) {
        resolve({ ok: false, reason: 'NUL byte' });
        return;
      }
      try {
        decodeUtf8Fatal(buf);
        resolve({ ok: true });
      } catch {
        resolve({ ok: false, reason: 'invalid UTF-8' });
      }
    });
  });
}

async function scanAll() {
  const candidates = [];
  await walk(join(ROOT, 'src'), candidates);
  const bad = [];
  for (const abs of candidates) {
    const r = await checkFile(abs);
    if (!r.ok) bad.push({ abs, reason: r.reason });
  }
  return { candidates, bad };
}

function gitTrackedFiles() {
  try {
    const out = execFileSync(
      'git',
      ['-C', ROOT, 'ls-files', '-z'],
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
    );
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function gitCheckout(paths) {
  const chunkSize = 40;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const batch = paths.slice(i, i + chunkSize);
    execFileSync('git', ['-C', ROOT, 'checkout', 'HEAD', '--', ...batch], {
      stdio: 'inherit',
    });
  }
}

/**
 * NUL のみが原因の破損を除去。UTF-8 としてまだ不正なら false。
 */
function tryStripNul(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return false;
  }
  if (!buf.includes(0)) return false;
  const stripped = Buffer.from(buf.filter((b) => b !== 0));
  try {
    decodeUtf8Fatal(stripped);
    writeFileSync(abs, stripped);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { fix } = parseArgs(process.argv.slice(2));

  let { candidates, bad } = await scanAll();

  if (bad.length === 0) {
    console.log(
      `verify-source-utf8: OK (${candidates.length} files under src/)`,
    );
    process.exit(0);
  }

  console.error('verify-source-utf8: failed — invalid source encoding:\n');
  for (const { abs, reason } of bad) {
    console.error(`  ${relative(ROOT, abs)} (${reason})`);
  }

  if (!fix) {
    console.error(
      '\nHint: npm run verify:utf8:fix  (git restore + NUL strip where needed)',
    );
    console.error(
      'Root cause is often disk/sync: run chkdsk on the drive, move project out of OneDrive sync folders.',
    );
    process.exit(1);
  }

  const trackedList = gitTrackedFiles();
  const tracked = new Set(trackedList ?? []);

  const toRestore = bad
    .map(({ abs }) => abs)
    .filter((abs) => tracked.has(relative(ROOT, abs).replace(/\\/g, '/')));

  if (toRestore.length > 0) {
    console.error('\nRestoring tracked file(s) from git HEAD...\n');
    gitCheckout(toRestore.map((p) => relative(ROOT, p)));
  }

  ({ bad } = await scanAll());

  if (bad.length > 0) {
    console.error('\nTrying NUL-byte removal on remaining file(s)...\n');
    for (const { abs } of bad) {
      tryStripNul(abs);
    }
  }

  ({ bad } = await scanAll());

  if (bad.length === 0) {
    console.log(
      `verify-source-utf8: fixed (${candidates.length} files under src/)`,
    );
    process.exit(0);
  }

  console.error('verify-source-utf8: still broken after --fix:\n');
  for (const { abs, reason } of bad) {
    console.error(`  ${relative(ROOT, abs)} (${reason})`);
  }
  console.error(
    '\nSevere corruption (not fixable by NUL removal): re-clone, or:',
  );
  console.error(
    '  git fetch && git checkout origin/<branch> -- <paths>',
  );
  console.error('Also run chkdsk on the drive if this keeps happening.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
