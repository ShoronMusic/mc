/**
 * WP REST プレイリスト → catalog_playlists*
 *
 * 前提: docs/sql/music8-catalog-extension.sql（+ cover_image_url パッチ）実行済み。
 *
 * Usage:
 *   npx tsx scripts/import-music8-playlists-from-wp.ts
 *   npx tsx scripts/import-music8-playlists-from-wp.ts --apply
 *   npx tsx scripts/import-music8-playlists-from-wp.ts --apply --limit=5
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { importGenreBestPlaylistsFromWp } from '@/lib/catalog-genre-best-import';

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
    else args.set(token.slice(2).trim(), '1');
  }
  return {
    apply: argv.includes('--apply'),
    limit: args.get('limit') ? Number(args.get('limit')) : null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npx tsx scripts/import-music8-playlists-from-wp.ts
  npx tsx scripts/import-music8-playlists-from-wp.ts --apply
  npx tsx scripts/import-music8-playlists-from-wp.ts --apply --limit=5`);
    process.exit(0);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が必要です。');
    process.exit(1);
  }

  console.log(opts.apply ? 'APPLY mode' : 'DRY-RUN mode');
  const result = await importGenreBestPlaylistsFromWp(admin, {
    apply: opts.apply,
    limit: opts.limit,
  });

  console.log(result.message ?? '');
  console.log(JSON.stringify(result.stats, null, 2));
  if (result.tableMissing) {
    process.exit(2);
  }
  if (!result.ok && result.stats.errors.length > 0) {
    console.error('errors:', result.stats.errors.slice(0, 20));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
