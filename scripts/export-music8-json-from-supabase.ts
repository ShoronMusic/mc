/**
 * Supabase → Music8 公開 JSON（musicaichat/v1 + styles_summary + style-monthly）。
 *
 * Usage:
 *   npx tsx scripts/export-music8-json-from-supabase.ts --song-id=<uuid>
 *   npx tsx scripts/export-music8-json-from-supabase.ts --full --year=2026
 *   npx tsx scripts/export-music8-json-from-supabase.ts --out=E:/m8/public/data --full
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  exportOneSongToDisk,
  rebuildStyleMonthlyFromDb,
  rebuildStylesSummaryFromDb,
  resolveMusic8JsonExportDir,
} from '@/lib/music8-catalog-json-write';

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
    songId: args.get('song-id')?.trim() || '',
    full: argv.includes('--full'),
    year: args.get('year') ? Number(args.get('year')) : new Date().getFullYear(),
    out: args.get('out')?.trim() || '',
    limit: args.get('limit') ? Number(args.get('limit')) : null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npx tsx scripts/export-music8-json-from-supabase.ts --song-id=<uuid>
  npx tsx scripts/export-music8-json-from-supabase.ts --full [--year=2026] [--out=dir]`);
    process.exit(0);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }

  const outDir = resolveMusic8JsonExportDir(opts.out || null);
  console.log(`[export] out=${outDir}`);

  if (opts.songId) {
    const r = await exportOneSongToDisk(admin, opts.songId, outDir);
    if (!r.ok) {
      console.error(r.reason);
      process.exit(1);
    }
    console.log('[export] song', r.songPath);
    await rebuildStylesSummaryFromDb(admin, outDir);
    process.exit(0);
  }

  if (!opts.full) {
    console.error('--song-id または --full を指定してください。');
    process.exit(1);
  }

  let offset = 0;
  const page = 200;
  let exported = 0;
  while (true) {
    let q = admin
      .from('songs')
      .select('id')
      .eq('catalog_scope', 'western')
      .not('music8_song_slug', 'is', null)
      .order('id')
      .range(offset, offset + page - 1);
    if (opts.limit != null && exported >= opts.limit) break;
    const { data, error } = await q;
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      if (opts.limit != null && exported >= opts.limit) break;
      const r = await exportOneSongToDisk(admin, row.id, outDir);
      if (r.ok) exported += 1;
      else console.warn('[skip]', row.id, r.reason);
    }
    offset += page;
    console.log(`[progress] exported=${exported} offset=${offset}`);
    if (rows.length < page) break;
  }

  const summary = await rebuildStylesSummaryFromDb(admin, outDir);
  const monthly = await rebuildStyleMonthlyFromDb(admin, opts.year, outDir);
  console.log('[done] songs', exported, 'styles', summary.map((s) => `${s.slug}:${s.count}`).join(' '));
  console.log('[done] style-monthly', monthly.year, monthly.total);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
