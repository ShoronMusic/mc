#!/usr/bin/env node
/**
 * Verify sources under `src/` are valid UTF-8 (no NUL / invalid bytes).
 * Usage:
 *   node scripts/verify-source-utf8.mjs
 *   node scripts/verify-source-utf8.mjs --fix
 *     Tracked files under src/: restore from git HEAD. Untracked: strip NUL bytes only.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json', '.md']);
const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

function decodeUtf8Fatal(buf) {
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

function parseArgs(argv) {
  return { fix: argv.includes('--fix') };
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
    } else if (e.isFile() && EXT.has(extname(e.name))) {
      out.push(p);
    }
  }
}

function gitLsFilesUnderSrc() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--', 'src'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function gitCheckout(relPathsFromRoot) {
  if (relPathsFromRoot.length === 0) return;
  execFileSync('git', ['checkout', 'HEAD', '--', ...relPathsFromRoot], { cwd: ROOT, stdio: 'inherit' });
}

const { fix } = parseArgs(process.argv);
const files = [];
await walk(SRC, files);

const trackedRel = new Set(gitLsFilesUnderSrc());
function isTracked(absPath) {
  return trackedRel.has(relative(ROOT, absPath).split('\\').join('/'));
}

let failed = false;
for (const abs of files.sort()) {
  const rel = relative(ROOT, abs).split('\\').join('/');
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    console.error(`[verify:utf8] cannot read: ${rel}`);
    failed = true;
    continue;
  }

  const nulIdx = buf.indexOf(0);
  if (nulIdx !== -1) {
    console.error(`[verify:utf8] NUL byte: ${rel}`);
    if (fix) {
      if (isTracked(abs)) {
        gitCheckout([rel]);
        console.error(`[verify:utf8] restored from HEAD: ${rel}`);
      } else {
        writeFileSync(abs, Buffer.from(buf.filter((b) => b !== 0)));
        console.error(`[verify:utf8] stripped NULs (untracked): ${rel}`);
      }
    } else {
      failed = true;
    }
    continue;
  }

  try {
    decodeUtf8Fatal(buf);
  } catch {
    console.error(`[verify:utf8] invalid UTF-8: ${rel}`);
    if (fix && isTracked(abs)) {
      gitCheckout([rel]);
      console.error(`[verify:utf8] restored from HEAD: ${rel}`);
    } else {
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
