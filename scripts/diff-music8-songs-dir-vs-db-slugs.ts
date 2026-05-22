/**
 * Music8 ローカル `data/songs/*.json` と Supabase `songs` の
 * `music8_artist_slug` + `music8_song_slug` の有無を突き合わせ、
 * 「ディスクにあって DB にスラッグ紐づけが無い（または片方欠け）」ファイルを列挙する。
 *
 * 注意:
 * - ライブラリ表示件数（邦楽寄り除外・曲マスタ行数）とは定義が異なる。
 * - チャット起点だけの曲は `music8_*` が空のことが多く、ファイル一覧とは 1:1 対応しない。
 *
 * Usage:
 *   npx tsx scripts/diff-music8-songs-dir-vs-db-slugs.ts --songs-dir="E:\m8\public\data\songs"
 *   npx tsx scripts/diff-music8-songs-dir-vs-db-slugs.ts --songs-dir="E:\m8\public\data\songs" --out-missing=tmp/music8-on-disk-not-in-db.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE = 1000;

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

function parseArgs(argv: string[]): { songsDir: string | null; outMissing: string; outOrphans: string | null; help: boolean } {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) {
      const k = token.slice(2, eq).trim();
      const v = token.slice(eq + 1).trim();
      if (k) args.set(k, v);
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    songsDir: args.get('songs-dir')?.trim() || null,
    outMissing: args.get('out-missing')?.trim() || path.resolve(process.cwd(), 'tmp', `music8-on-disk-not-in-db-${stamp}.txt`),
    outOrphans: args.get('out-orphans')?.trim() || null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/diff-music8-songs-dir-vs-db-slugs.ts --songs-dir="E:\\\\m8\\\\public\\\\data\\\\songs"
    [--out-missing=tmp/music8-on-disk-not-in-db.txt] [--out-orphans=tmp/db-slugs-no-file.txt]

Requires .env.local with SUPABASE_SERVICE_ROLE_KEY.

Compares:
  - On disk: each *.json basename without extension (lowercased) vs
  - In DB: lower(music8_artist_slug + '_' + music8_song_slug) where both columns are non-empty.

Skips non-.json and names starting with '_' (e.g. _error-log.txt if renamed).`);
}

function fileKeyFromName(fileName: string): string | null {
  if (!fileName.toLowerCase().endsWith('.json')) return null;
  if (fileName.startsWith('_')) return null;
  const base = fileName.slice(0, -'.json'.length);
  if (!base.trim()) return null;
  return base.trim().toLowerCase();
}

async function loadDbSlugKeys(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('songs')
      .select('music8_artist_slug, music8_song_slug')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.code === '42703') {
        throw new Error('songs に music8_artist_slug / music8_song_slug 列がありません。docs/supabase-songs-and-performances-tables.md を参照してください。');
      }
      throw new Error(error.message);
    }
    const batch = (data ?? []) as { music8_artist_slug?: string | null; music8_song_slug?: string | null }[];
    for (const r of batch) {
      const a = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const s = (r.music8_song_slug ?? '').trim().toLowerCase();
      if (!a || !s) continue;
      keys.add(`${a}_${s}`);
    }
    if (batch.length < PAGE) break;
  }
  return keys;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }
  if (!opts.songsDir) {
    console.error('--songs-dir が必要です。');
    printUsage();
    process.exit(1);
  }

  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient が null です。.env.local の SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を確認してください。');
    process.exit(1);
  }

  const absDir = path.resolve(opts.songsDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error(`ディレクトリがありません: ${absDir}`);
    process.exit(1);
  }

  const fileNames = fs.readdirSync(absDir);
  const fileKeys = new Set<string>();
  let skippedNonJson = 0;
  let skippedUnderscore = 0;
  for (const name of fileNames) {
    if (name.startsWith('_')) {
      skippedUnderscore += 1;
      continue;
    }
    const k = fileKeyFromName(name);
    if (!k) {
      skippedNonJson += 1;
      continue;
    }
    fileKeys.add(k);
  }

  console.error('[diff] reading DB slug keys…');
  const dbKeys = await loadDbSlugKeys(admin);

  const onDiskNotInDb: string[] = [];
  for (const k of fileKeys) {
    if (!dbKeys.has(k)) onDiskNotInDb.push(k);
  }
  onDiskNotInDb.sort((a, b) => a.localeCompare(b));

  const inDbNotOnDisk: string[] = [];
  if (opts.outOrphans) {
    for (const k of dbKeys) {
      if (!fileKeys.has(k)) inDbNotOnDisk.push(k);
    }
    inDbNotOnDisk.sort((a, b) => a.localeCompare(b));
  }

  fs.mkdirSync(path.dirname(opts.outMissing), { recursive: true });
  fs.writeFileSync(opts.outMissing, onDiskNotInDb.join('\n') + (onDiskNotInDb.length ? '\n' : ''), 'utf8');

  if (opts.outOrphans && inDbNotOnDisk.length >= 0) {
    fs.mkdirSync(path.dirname(opts.outOrphans), { recursive: true });
    fs.writeFileSync(opts.outOrphans, inDbNotOnDisk.join('\n') + (inDbNotOnDisk.length ? '\n' : ''), 'utf8');
  }

  const summary = {
    songsDir: absDir,
    jsonLikeFilesOnDisk: fileKeys.size,
    skippedLeadingUnderscore: skippedUnderscore,
    skippedNonJson: skippedNonJson,
    dbRowsWithBothSlugs: dbKeys.size,
    onDiskNotInDbCount: onDiskNotInDb.length,
    inDbNotOnDiskCount: opts.outOrphans ? inDbNotOnDisk.length : null,
    outMissing: opts.outMissing,
    outOrphans: opts.outOrphans,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
